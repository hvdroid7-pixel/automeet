// ==UserScript==
// @name         Mystery in the Meeting (AUTO) V9
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Sistema automático de partidas Mystery in the Meeting para Pony Town.
// @author       Dot + Claude
// @match        https://pony.town/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════════════
       CONFIGURACIÓN
       ═══════════════════════════════════════════════════════════ */
    const MIN_PLAYERS       = 8;
    const MAX_PLAYERS       = 18;
    const LOBBY_INTERVAL_MS = 8_000;
    const NIGHT_START_DELAY = 1 * 60_000;
    const DAY_TURN_DELAY    = 2 * 60_000;
    const TURN_TIMEOUT      = 60_000;
    const VOTING_DURATION   = 60_000;
    const TASKS_DURATION    = 10 * 60_000;
    const TASKS_WARNING_AT  = 5 * 60_000;
    const TASKS_TO_NIGHT_DELAY = 2 * 60_000;
    const NAME_REGEX        = /^[a-zA-Z0-9_.\-]+$/;

    const SK = { accounts: 'mitm_auto_accounts', sessions: 'mitm_auto_sessions' };

    /* ═══════════════════════════════════════════════════════════
       DEFINICIÓN DE ROLES
       ═══════════════════════════════════════════════════════════ */
    const ROLES_DEF = [
        // BUENOS
        { name:'Cupido',        emoji:'💘', team:'buenos', turn:'nocturno',
          desc:'1 vez por juego (noche 1 o 2) flechas a 2 jugadores: si uno muere, el otro también. Ganas con los buenos o con tu pareja si son los únicos sobrevivientes.',
          turnMsg:'【💘】 Cupido, escribe los 2 jugadores a flechar (ej: Jugador1 Jugador2). Solo disponible noche 1-2 y tienes 1 uso ...' },
        { name:'Curandero',     emoji:'🎐', team:'buenos', turn:'nocturno',
          desc:'1 vez por juego resucitas a un muerto. El resucitado sabe tu identidad. Tras la noche 5 puedes usarlo de nuevo. Si mueres antes de la noche 5 sin usarlo, revivirás en ella.',
          turnMsg:'【🎐】 Curandero, ¿deseas resucitar a algún jugador muerto? Escribe su nombre o "no" para pasar ...' },
        { name:'Chef',          emoji:'🍜', team:'buenos', turn:'nocturno',
          desc:'Tienes 2 tomates. Dáselos a jugadores. Si el portador es atacado, el tomate manchará a 2 sospechosos del ataque.',
          turnMsg:'【🍜】 Chef, tienes {tomatoes} tomate(s). Escribe el nombre del jugador al que le das un tomate, o "no" para pasar ...' },
        { name:'Detective',     emoji:'🐾', team:'buenos', turn:'nocturno',
          desc:'Cada noche investigas a un jugador y descubres su rol.',
          turnMsg:'【🐾】 Detective, ¿a qué jugador deseas investigar esta noche? ...' },
        { name:'Guardaespaldas',emoji:'⛄', team:'buenos', turn:'nocturno',
          desc:'Cada noche proteges a 2 jugadores. Si uno es atacado, el daño te lo llevas tú. Aguantas hasta 2 ataques.',
          turnMsg:'【⛄】 Guardaespaldas, escribe los 2 jugadores a proteger (ej: Jugador1 Jugador2). Aguante restante: {health} ...' },
        { name:'Justiciero',    emoji:'⚔', team:'buenos', turn:'nocturno',
          desc:'Cada noche proteges a un jugador. Si es atacado, el daño te lo llevas tú. Al morir, puedes llevarte a un malvado contigo.',
          turnMsg:'【⚔】 Justiciero(a), ¿a qué jugador deseas proteger esta noche? ...' },
        { name:'Médico',        emoji:'💊', team:'buenos', turn:'nocturno',
          desc:'Cada noche proteges a un jugador. No puedes proteger al mismo dos veces seguidas.',
          turnMsg:'【💊】 Médico(a), ¿a qué jugador deseas proteger esta noche? (no puedes repetir al mismo 2 veces seguidas) ...' },
        { name:'Melómano',      emoji:'🎧', team:'buenos', turn:'nocturno',
          desc:'Cada noche pones una canción a un jugador. Si es malvado: bloquea su habilidad. Si es bueno: gana 1 perla extra. No puedes repetir el mismo jugador seguido.',
          turnMsg:'【🎧】 Melómano, ¿a qué jugador le pondrás una canción esta noche? (no puedes repetir el mismo) ...' },
        { name:'Androide',      emoji:'🤖', team:'buenos', turn:'diurno',
          desc:'Cada día escaneas a 2 jugadores y descubres si alguno mató la noche anterior.',
          turnMsg:'【🤖】 Androide, escribe 2 jugadores a escanear (ej: Jugador1 Jugador2) ...' },
        { name:'Alguacil',      emoji:'⭐', team:'buenos', turn:'diurno',
          desc:'Tienes 1 bala (elimina a quien dispares) y puedes desvelar el rol de 1 jugador 1 vez. No puedes hacer ambas el mismo día. Al disparar tu identidad se revela.',
          turnMsg:'【⭐】 Alguacil — Bala: {bullet} | Desvelar: {reveal} — Escribe "disparar Jugador" o "desvelar Jugador" ...' },
        { name:'Psíquico',      emoji:'👽', team:'buenos', turn:'multiturno',
          desc:'Puedes congelar, exterminar o controlar el voto de un jugador. 3 acciones totales, máximo 1 exterminación. Exterminar a un bueno te mata también.',
          turnMsg:'【👽】 Psíquico, acciones restantes: {actions}. Escribe "congelar Jugador", "exterminar Jugador" o "controlar Jugador ObjetivoVoto" ...' },
        { name:'Espectro',      emoji:'👻', team:'buenos', turn:'votacion',
          desc:'Una vez por partida, en fase de votación, provoca un fenómeno: los muertos pueden votar ese día.',
          turnMsg:'【👻】 Espectro, ¿deseas "provocar" el fenómeno hoy (los muertos votan) o "guardar" tu habilidad? ...' },
        { name:'Juez',          emoji:'🏳', team:'buenos', turn:'votacion',
          desc:'Puedes revelar tu identidad para que tu voto cuente doble. Además, 1 vez por partida puedes cancelar una ejecución.',
          turnMsg:'【🏳】 Juez(a), el jugador más votado es {mostVoted}. Escribe "cancelar" para cancelar su ejecución, o "no" para dejar que proceda ...' },
        // MALOS
        { name:'Asesino',       emoji:'🔪', team:'malos',  turn:'especial',
          desc:'Tu voto nocturno tiene prioridad sobre el resto del equipo malvado. Al comenzar la reunión del día recibes una daga gratis.',
          turnMsg:'【🔪】 Asesino(a), vota por el jugador a eliminar esta noche (tu voto tiene prioridad). Solo escribe el nombre ...' },
        { name:'Espía',         emoji:'🐈', team:'malos',  turn:'nocturno',
          desc:'Cada noche espías a un jugador (descubres su rol). La siguiente noche puedes matarlo o seguir espiando. Una vez que mates, no puedes volver a espiar.',
          turnMsg:'【🐈】 Espía — Último espiado: {lastSpy} — Escribe "espiar Nombre" para espiar, o "matar" para eliminar al último espiado ...' },
        { name:'Jorguín',       emoji:'🖤', team:'malos',  turn:'diurno',
          desc:'4 veces por juego hechizas un rol bloqueando su habilidad. No puedes hechizar el mismo rol dos veces seguidas.',
          turnMsg:'【🖤】 Jorguín — Hechizos restantes: {hexes} | Último hechizado: {lastHex} — Escribe el nombre del ROL a hechizar ...' },
        { name:'Secuaz',        emoji:'🗡', team:'malos',  turn:'votacion',
          desc:'1 vez por juego cancelas la ejecución de un jugador malvado (o la tuya). Si salvas a un malvado, puedes matar a otro jugador como bono.',
          turnMsg:'【🗡】 Secuaz, el jugador más votado es {mostVoted}. ¿Deseas cancelar su ejecución? Responde "si" o "no" ...' },
        // SOLITARIO
        { name:'Pirómano',      emoji:'🔥', team:'solo',   turn:'nocturno',
          desc:'Cada noche encharcas a 2 jugadores de gasolina o incendias a todos los encharcados. Ganas si eres el único sobreviviente. El equipo malvado no puede atacarte.',
          turnMsg:'【🔥】 Pirómano — Encharcados: {drenched} — Escribe "encharcar Jugador1 Jugador2" o "incendiar" ...' },
        { name:'Inocente', emoji:'🧑', team:'buenos', turn:'especial',
          desc:'Eres un ciudadano inocente sin habilidades especiales. Ayuda al equipo bueno usando solo tu astucia.',
          turnMsg:'【🧑】 Inocente, no tienes habilidades activas esta fase. ¡Usa tu astucia y participa en la discusión!' },
    ];

    // Rol Inocente usado para jugadores extra al expandir el lobby
    const INOCENTE_ROLE = ROLES_DEF[ROLES_DEF.length - 1];

    /* ═══════════════════════════════════════════════════════════
       ALMACENAMIENTO
       ═══════════════════════════════════════════════════════════ */
    function loadJSON(key, fallback) {
        try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
        catch { return fallback; }
    }
    function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
    const loadAccounts = () => loadJSON(SK.accounts, {});
    const saveAccounts = d  => saveJSON(SK.accounts, d);
    const loadSessions = () => loadJSON(SK.sessions, {});
    const saveSessions = d  => saveJSON(SK.sessions, d);

    /* ═══════════════════════════════════════════════════════════
       ESTADO DEL JUEGO
       ═══════════════════════════════════════════════════════════ */
    function mkGame() {
        return {
            phase:          'idle',
            players:        [],
            nightNum:       0,
            dayNum:         0,
            pendingTurns:   [],
            turnsAttended:  0,
            totalTurns:     0,
            evilVotes:      {},
            skipVotes:      new Set(),
            cupidoPair:     null,
            nightResults:   [],
            protections:    [],
            pendingConfs:   {},
            hexedRole:      null,
            frozenPlayer:   null,
            controlledVote: null,
            voteTally:      {},
            votesMade:      {},
            mostVoted:      null,
            voteLeaders:    [],
            secuazBonusKill:false,
            justicieroKill: null,
            roleState:      {},
            expanded:       false,
            admins:         new Set(),
            items:          {},     // { playerName: [{ id, name, emoji, ... }] }
            lobbyTimer:     null,
            taskTimer:      null,
            taskWarnTimer:  null,
            nextNightTimer: null,
            turnTimeoutTimer:null,
            turnWindowClosed:new Set(),
            ghostVotingEnabled:false,
            votingDeadline:  null,
        };
    }
    let GAME = mkGame();

    /* ═══════════════════════════════════════════════════════════
       COLA DE MENSAJES
       ═══════════════════════════════════════════════════════════ */
    const Q = [];
    let sending = false;

    function pub(text)   { Q.push({ t:'msg',   text });         processQ(); }
    function w(to, text) { Q.push({ t:'w',     to, text });     processQ(); }
    function pause(ms)   { Q.push({ t:'pause', ms });           processQ(); }

    function processQ() {
        if (sending || Q.length === 0) return;
        sending = true;
        const job = Q.shift();
        // Abrir chat antes de cada acción (igual que el script de referencia)
        const chatBtn = document.querySelector('.chat-open-button.unselectable');
        if (chatBtn) chatBtn.click();
        if (job.t === 'pause') {
            setTimeout(() => { sending = false; processQ(); }, job.ms);
        } else if (job.t === 'msg') {
            setTimeout(() => sendRaw(job.text, () => setTimeout(() => { sending = false; processQ(); }, 150)), 80);
        } else if (job.t === 'w') {
            setTimeout(() => doWhisper(job.to, job.text, () => { sending = false; processQ(); }), 80);
        } else { sending = false; processQ(); }
    }

    function getIO() {
        return {
            input: document.querySelector('.chat-textarea.chat-commons.hide-scrollbar'),
            btn:   document.querySelector('ui-button[title="Send message (hold Shift to send without closing input)"] button'),
        };
    }
    function openChat() { const b = document.querySelector('.chat-open-button.unselectable'); if (b) b.click(); }

    function sendRaw(text, cb) {
        const { input, btn } = getIO();
        if (!input) { setTimeout(() => cb && cb(), 250); return; }
        setTimeout(() => {
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            if (btn) btn.click();
            else input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', keyCode:13, bubbles:true, cancelable:true }));
            setTimeout(() => cb && cb(), 220);
        }, 200);
    }

    function setNativeValue(el, value) {
        if (!el) return;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function simEnter(input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
        input.dispatchEvent(new KeyboardEvent('keyup',   { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
    }

    function getChatTabsByName(playerName) {
        return Array.from(document.querySelectorAll('.chat-box-type'))
            .filter(box => norm(box.querySelector('.chat-box-type-name')?.textContent) === norm(playerName));
    }

    function clickChatTab(box) {
        if (!box) return;
        box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        box.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    function isWhisperContextReady(playerName) {
        const activeTab = document.querySelector('.chat-box-type.active, .chat-box-type.selected');
        if (activeTab) {
            const activeName = norm(activeTab.querySelector('.chat-box-type-name')?.textContent || '');
            if (activeName === norm(playerName)) return true;
        }
        const input = getIO().input;
        const ph = norm(input?.getAttribute('placeholder') || '');
        return ph.includes(norm(playerName)) && ph.includes('whisper');
    }

    async function ensureWhisperReady(playerName, attempts = 3) {
        for (let i = 0; i < attempts; i++) {
            openChat();
            const { input } = getIO();
            if (!input) { await new Promise(r => setTimeout(r, 180)); continue; }
            setNativeValue(input, `/w ${playerName}`);
            simEnter(input);
            const channelCreated = await waitForWhisperChannel(playerName, 1500);
            if (!channelCreated) continue;
            const tabs = getChatTabsByName(playerName);
            if (tabs[0]) clickChatTab(tabs[0]);
            await new Promise(r => setTimeout(r, 120));
            if (isWhisperContextReady(playerName) || getChatTabsByName(playerName).length > 0) return true;
        }
        return false;
    }

    function doWhisper(playerName, message, cb) {
        const { input, btn } = getIO();
        if (!input) { setTimeout(() => cb && cb(), 400); return; }

        ensureWhisperReady(playerName).then((isReady) => {
            if (!isReady) {
                pub(`⚠ No se pudo abrir Whisper con ${playerName}. Mensaje retenido para evitar chat público.`);
                setTimeout(() => cb && cb(), 120);
                return;
            }
            // Paso 2: enviar mensaje en el canal whisper activo
            setNativeValue(input, message);
            if (btn) btn.click(); else simEnter(input);

            setTimeout(() => {
                // Paso 3: restaurar chat de party con doble click al canal anterior
                let clicked = false;

                getChatTabsByName(playerName).forEach(box => {
                    clickChatTab(box);
                    setTimeout(() => clickChatTab(box), 10);
                    clicked = true;
                });

                if (!clicked) {
                    setNativeValue(input, '/p');
                    simEnter(input);
                }

                setTimeout(() => cb && cb(), 150);
            }, 120);
        });
    }

    /* ═══════════════════════════════════════════════════════════
       UTILIDADES
       ═══════════════════════════════════════════════════════════ */
    function norm(s) { return (s || '').replace(/[\u200B\uFEFF]/g,'').trim().toLowerCase(); }
    function isValidName(n) { return NAME_REGEX.test(n); }

    function levenshtein(a, b) {
        const dp = Array.from({length:a.length+1}, (_,i) =>
            Array.from({length:b.length+1}, (_,j) => i===0?j:j===0?i:0));
        for (let i=1; i<=a.length; i++)
            for (let j=1; j<=b.length; j++)
                dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
        return dp[a.length][b.length];
    }

    function findPlayer(name, pool) {
        if (!name || !pool || !pool.length) return null;
        const nl = norm(name);
        let p = pool.find(x => norm(x.name) === nl);
        if (p) return { player:p, exact:true };
        let sw = pool.filter(x => norm(x.name).startsWith(nl));
        if (sw.length === 1) return { player:sw[0], exact:false };
        let best=null, bestD=Infinity;
        pool.forEach(x => { const d=levenshtein(nl,norm(x.name)); if(d<bestD){bestD=d;best=x;} });
        return (bestD<=3 && best) ? { player:best, exact:false } : null;
    }

    function alive()  { return GAME.players.filter(p => p.status==='alive'); }
    function dead()   { return GAME.players.filter(p => p.status==='dead'); }
    function getP(n)  { return GAME.players.find(p => p.name===n) || null; }

    function suggest(senderName, suggestedName, action) {
        GAME.pendingConfs[senderName] = { suggestion:suggestedName, action };
        w(senderName, `¿Quisiste decir ${suggestedName}? Di "si" para proceder, o "no" para negar la acción.`);
    }

    function findAlive(text, excludeName) {
        return findPlayer(text, alive().filter(p => p.name !== excludeName));
    }

    function canUseAbility(player) {
        const rs = GAME.roleState[player.name] || {};
        if (GAME.frozenPlayer === player.name) return { ok:false, reason:'❄ Estás congelado y no puedes usar habilidades este turno.' };
        if (player.tired) return { ok:false, reason:'💤 Estás cansado y no puedes usar habilidades este turno.' };
        if (GAME.hexedRole === player.role.name) return { ok:false, reason:'⚠ Tu rol está bloqueado por hechizo de Jorguín este turno.' };
        if (rs.blockedByMelomano) {
            rs.blockedByMelomano = false;
            return { ok:false, reason:'🎧 Tu habilidad fue bloqueada por Melómano este turno.' };
        }
        return { ok:true };
    }

    function hasActiveTurn(playerName) {
        return GAME.pendingTurns.some(t => !t.responded && t.playerName === playerName);
    }

    function waitForElement(selector, timeout = 5000) {
        return new Promise(resolve => {
            const start = Date.now();
            const timer = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) { clearInterval(timer); resolve(el); return; }
                if (Date.now() - start >= timeout) { clearInterval(timer); resolve(null); }
            }, 120);
        });
    }

    function clickVisibleButtonByText(regex, root = document) {
        const btns = Array.from(root.querySelectorAll('button'));
        const b = btns.find(x => {
            const text = (x.innerText || x.textContent || '').trim();
            const style = window.getComputedStyle(x);
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && x.offsetParent !== null;
            return visible && regex.test(text);
        });
        if (!b) return false;
        b.click();
        return true;
    }

    function waitForWhisperChannel(playerName, timeout = 1200) {
        return new Promise(resolve => {
            const start = Date.now();
            const timer = setInterval(() => {
                const found = Array.from(document.querySelectorAll('.chat-box-type .chat-box-type-name'))
                    .some(el => norm(el.textContent) === norm(playerName));
                if (found) { clearInterval(timer); resolve(true); return; }
                if (Date.now() - start >= timeout) { clearInterval(timer); resolve(false); }
            }, 80);
        });
    }

    let lastPartyDescText = '';
    function uniquePlayersByName(players) {
        const seen = new Set();
        return players.filter(p => {
            const key = norm(p.name);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    async function updatePartyDescription() {
        const aliveLines = uniquePlayersByName(GAME.players.filter(p => p.status === 'alive'))
            .map(p => {
                const st = p.tired ? '💤' : '💗';
                const roleInfo = (p.roleRevealed && p.role) ? ` [${p.role.emoji} ${p.role.name}]` : '';
                return `(${st}) ${p.name}${roleInfo}`;
            }).join('\n');
        const deadLines = uniquePlayersByName(GAME.players.filter(p => p.status === 'dead'))
            .map(p => {
                const roleInfo = p.role ? ` [${p.role.emoji} ${p.role.name}]` : '';
                return `(🪦) ${p.name}${roleInfo}`;
            }).join('\n');
        const phaseTag = `<Día ${GAME.dayNum} / Noche ${GAME.nightNum}>`;
        const descriptionText = [
            '► Jugadores vivos:',
            aliveLines || '—',
            '',
            '► Jugadores muertos:',
            deadLines || '—',
            '',
            phaseTag,
            '',
            '► Info host:',
            'Discord:',
            'https://discord.gg/wX8mJxCJFq',
            'YouTube:',
            'youtube.com/@dotcleo',
        ].join('\n');
        if (descriptionText === lastPartyDescText) return true;

        const leaderBtn =
            document.querySelector('ui-button.party-list-options[title="You are party leader"] button') ||
            document.querySelector('ui-button.party-list-options button');
        if (!leaderBtn) return false;
        leaderBtn.click();
        await new Promise(r => setTimeout(r, 250));
        const renameBtn = await waitForElement('button[title="Rename party"], button[title="Renombrar party"]', 4000);
        if (renameBtn) renameBtn.click();
        else if (!clickVisibleButtonByText(/^(rename party|renombrar party|renombrar)$/i, document)) return false;
        await new Promise(r => setTimeout(r, 300));
        const textarea = await waitForElement('emoji-textarea.party-description textarea', 5000);
        if (!textarea) return false;
        setNativeValue(textarea, descriptionText.slice(0, 450));
        const saved = clickVisibleButtonByText(/^(save|guardar|ok|confirm|apply|accept|done)$/i, document);
        if (saved) lastPartyDescText = descriptionText;
        return saved;
    }

    let partyDescDebounce = null;
    function schedulePartyDescriptionUpdate(delay = 600) {
        if (partyDescDebounce) clearTimeout(partyDescDebounce);
        partyDescDebounce = setTimeout(() => { updatePartyDescription().catch(()=>{}); }, delay);
    }

    function shuffle(arr) {
        for (let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
        return arr;
    }

    function extractText(node) {
        let t='';
        (node.childNodes||[]).forEach(ch => {
            if (ch.nodeType===Node.TEXT_NODE) t+=ch.textContent;
            else if (ch.tagName==='IMG') t+=ch.alt||'';
            else t+=ch.textContent||'';
        });
        return t.replace(/[\u200B\uFEFF]/g,'').trim();
    }

    function initRoleState(roleName) {
        const map = {
            'Cupido':        {used:false},
            'Curandero':     {used:false, used2:false},
            'Chef':          {tomatoes:2, targets:[]},
            'Guardaespaldas':{health:2},
            'Justiciero':    {},
            'Médico':        {lastProtected:null, consecutive:0},
            'Melómano':      {lastTarget:null},
            'Androide':      {},
            'Alguacil':      {bulletUsed:false, revealUsed:false},
            'Psíquico':      {actions:3, extsUsed:0},
            'Espectro':      {used:false},
            'Juez':          {cancelUsed:false, revealed:false},
            'Asesino':       {},
            'Espía':         {lastSpy:null, canKill:false, killedAlready:false, pendingKill:null},
            'Jorguín':       {hexesLeft:4, lastHexed:null},
            'Secuaz':        {used:false},
            'Pirómano':      {drenched:[], igniteThisNight:false},
            'Inocente':      {},
        };
        return map[roleName] ? {...map[roleName]} : {};
    }

    function buildTurnMsg(player) {
        const rs = GAME.roleState[player.name] || {};
        let msg = player.role.turnMsg;
        msg = msg.replace('{tomatoes}', rs.tomatoes ?? '?');
        msg = msg.replace('{health}',   rs.health   ?? '?');
        msg = msg.replace('{actions}',  rs.actions  ?? '?');
        msg = msg.replace('{bullet}',   rs.bulletUsed  ? '❌ USADA' : '✔ DISPONIBLE');
        msg = msg.replace('{reveal}',   rs.revealUsed  ? '❌ USADO' : '✔ DISPONIBLE');
        msg = msg.replace('{hexes}',    rs.hexesLeft ?? '?');
        msg = msg.replace('{lastHex}',  rs.lastHexed || 'ninguno');
        msg = msg.replace('{drenched}', rs.drenched?.length ? rs.drenched.join(', ') : 'ninguno');
        msg = msg.replace('{lastSpy}',  rs.lastSpy || 'nadie');
        msg = msg.replace('{mostVoted}',GAME.mostVoted || 'ninguno');
        return msg;
    }

    function buildTurnWhisperText(turnNumber, msg) {
        return `——— ✦ Turno N.º ${turnNumber} ———\n${msg}`;
    }

    function buildRoleMsg(player) {
        const r = player.role;
        const tL = {buenos:'🛡️ Bueno', malos:'☠️ Malvado', solo:'👤 Solitario'}[r.team] || r.team;
        const phL = {nocturno:'🌙 Nocturno', diurno:'☀️ Diurno', votacion:'🗞️ Votación', multiturno:'🌈 Multi-turno', especial:'❕ Especial'}[r.turn] || r.turn;
        return `✦ Eres ${r.emoji} ${r.name} — Equipo: ${tL} — Tipo: ${phL} ║ ${r.desc} ║ Info: dotcleo.carrd.co`;
    }

    /* ═══════════════════════════════════════════════════════════
       MATAR JUGADOR
       ═══════════════════════════════════════════════════════════ */
    function killPlayer(name, cause) {
        const p = getP(name);
        if (!p || p.status==='dead') return;
        if (p.role?.name === 'Espectro') {
            p.roleRevealed = true;
            pub(`👻 ¡${name} es el Espectro! No puede morir y permanece en juego.`);
            schedulePartyDescriptionUpdate();
            return;
        }

        // Amuleto embrujado: revive como Inocente
        const amuleto = (GAME.items[name]||[]).find(it=>it.id==='amuleto');
        if (amuleto) {
            GAME.items[name] = GAME.items[name].filter(it=>it!==amuleto);
            pub(`✨ ¡${name} ha activado su Amuleto Embrujado y ha regresado a la vida como Inocente!`);
            p.role = INOCENTE_ROLE;
            GAME.roleState[name] = {};
            p.roleRevealed = false;
            schedulePartyDescriptionUpdate();
            return;
        }

        // Botiquín: sobrevive un día más
        if (cause!=='botiquin_expired') {
            const botiquin = (GAME.items[name]||[]).find(it=>it.id==='botiquin');
            if (botiquin) {
                GAME.items[name] = GAME.items[name].filter(it=>it!==botiquin);
                pub(`🩹 ¡${name} usó su Botiquín y sobrevivió al ataque! (Efecto único)`)
                return;
            }
        }

        // Daga: al morir mata a otro jugador
        const daga = (GAME.items[name]||[]).find(it=>it.id==='daga');
        if (daga) {
            GAME.items[name] = GAME.items[name].filter(it=>it!==daga);
            // Pedir objetivo por whisper (se registra pendingConf)
            p.status = 'dead'; // marcar muerto primero
            GAME.pendingConfs[name] = { suggestion: null, action: null, daga: true };
            w(name, '🗡 ¡Tienes una Daga! Escribe el nombre del jugador al que quieres llevarte contigo:');
            setTimeout(() => { if (GAME.pendingConfs[name]?.daga) { delete GAME.pendingConfs[name]; checkWinCondition(); } }, 20_000);
            // Saltar el resto del flujo normal
            if (GAME.cupidoPair) {
                const [a,b]=GAME.cupidoPair;
                if(name===a||name===b){const other=name===a?b:a;const op=getP(other);if(op&&op.status==='alive'){op.status='dead';pub(`💔 ¡${other} ha perdido a su flechado y ha muerto! 💘`);}}
            }
            schedulePartyDescriptionUpdate();
            return;
        }

        // Megáfono: al morir revela el rol de un jugador (pendiente)
        const megafono = (GAME.items[name]||[]).find(it=>it.id==='megafono');
        if (megafono) {
            GAME.items[name] = GAME.items[name].filter(it=>it!==megafono);
            GAME.pendingConfs[name] = { suggestion: null, action: null, megafono: true };
            w(name, '📢 ¡Tienes un Megáfono! Escribe el nombre del jugador cuyo rol quieres revelar al morir:');
            setTimeout(() => { if (GAME.pendingConfs[name]?.megafono) delete GAME.pendingConfs[name]; }, 15_000);
        }

        p.status = 'dead';

        // Cupido: si muere uno del par, muere el otro
        if (GAME.cupidoPair) {
            const [a, b] = GAME.cupidoPair;
            if (name===a||name===b) {
                const other = name===a?b:a;
                const op = getP(other);
                if (op && op.status==='alive') { op.status='dead'; pub(`💔 ¡${other} ha perdido a su flechado y ha muerto! 💘`); }
            }
        }

        // Justiciero: al morir protegiendo, elige a quién llevarse
        if (cause==='justiciero_fell') {
            GAME.justicieroKill = {killer:name};
            const malosAlive = alive().filter(x=>x.role.team==='malos').map(x=>x.name);
            w(name, `⚔ Has caído protegiendo. ¡Pero te llevarás a alguien contigo! Elige un malvado: ${malosAlive.join(', ')}`);
        }

        schedulePartyDescriptionUpdate();
        checkWinCondition();
    }

    /* ═══════════════════════════════════════════════════════════
       CONDICIÓN DE VICTORIA
       ═══════════════════════════════════════════════════════════ */
    function checkWinCondition() {
        const alv  = alive();
        const buen = alv.filter(p=>p.role.team==='buenos');
        const malo = alv.filter(p=>p.role.team==='malos');
        const solo = alv.filter(p=>p.role.team==='solo');
        const piro = solo.find(p=>p.role.name==='Pirómano');

        if (piro && alv.length===1) { announceWin('solo',[piro.name]); return true; }
        if (GAME.cupidoPair) {
            const [a,b]=GAME.cupidoPair, an=alv.map(p=>p.name);
            if (an.length===2&&an.includes(a)&&an.includes(b)) { announceWin('cupido',[a,b]); return true; }
        }
        if (malo.length>0&&buen.length===0&&solo.length===0) { announceWin('malos',malo.map(p=>p.name)); return true; }
        if (buen.length>0&&malo.length===0&&solo.length===0) { announceWin('buenos',buen.map(p=>p.name)); return true; }
        if (alv.length===0) { announceWin('empate',[]); return true; }
        return false;
    }

    function announceWin(winner, names) {
        clearAllTimers();
        const msgs = {
            buenos: `🎉 ¡El Equipo Bueno ha ganado! Felicidades a: ${names.join(', ')} 🛡️`,
            malos:  `☠️ ¡El Equipo Malvado ha ganado! Felicidades a: ${names.join(', ')}`,
            solo:   `🔥 ¡El Pirómano ha ganado! Ha quemado a todos. 👤`,
            cupido: `💘 ¡Los enamorados ganan! ${names.join(' y ')} son los únicos sobrevivientes.`,
            empate: `🏳️ ¡Empate! No queda ningún jugador vivo.`,
        };
        pub(msgs[winner] || '✧ ¡El juego ha terminado!');
        pause(800);
        pub('✧ ¡Gracias por jugar Mystery in the Meeting! Revisando estadísticas...');
        updateMITMStats(winner, names);
        setTimeout(() => { GAME = mkGame(); }, 2000);
    }

    function updateMITMStats(winner, winnerNames) {
        const accs = loadAccounts();
        GAME.players.forEach(p => {
            if (!p.mitmUser) return;
            const acc = accs[p.mitmUser];
            if (!acc) return;
            const won = winnerNames.includes(p.name);
            if (winner==='empate')    { acc.draws++;  acc.seasonPoints+=1; }
            else if (won)             { acc.wins++;   acc.seasonPoints+=3; }
            else                      { acc.losses++; }
        });
        saveAccounts(accs);
    }

    function clearAllTimers() {
        clearInterval(GAME.lobbyTimer);
        clearTimeout(GAME.taskTimer);
        clearTimeout(GAME.taskWarnTimer);
        clearTimeout(GAME.nextNightTimer);
        clearTimeout(GAME.turnTimeoutTimer);
    }

    /* ═══════════════════════════════════════════════════════════
       GESTIÓN DEL LOBBY
       ═══════════════════════════════════════════════════════════ */
    function cmdCrear(senderName) {
        if (GAME.phase!=='idle') { pub('⚠ Ya hay una partida activa. Usa !reset si necesitas reiniciar.'); return; }
        GAME = mkGame(); GAME.phase = 'lobby';
        if (senderName !== '__host__') GAME.admins.add(senderName);
        pub('¡Una nueva partida está a punto de comenzar! ✧');
        pause(700);
        pub('► Usa !jugar para unirte a la partida. Si cuentas con una cuenta ✦MITM: no olvides iniciar sesión primero con !login en Whisper para acumular puntos.');
        GAME.lobbyTimer = setInterval(() => {
            if (GAME.phase!=='lobby') { clearInterval(GAME.lobbyTimer); return; }
            const n = GAME.players.length;
            let msg;
            if (n<MIN_PLAYERS)      msg=`◌ Esperando mínimo 8 jugadores para comenzar la partida ... (${n}/18)`;
            else if (n<MAX_PLAYERS) msg=`◌ Esperando jugadores para comenzar la partida ... (${n}/18)`;
            else                    msg=`◌ Esperando para comenzar la partida ... (18/18) ✧ Completa.`;
            pub(msg);
        }, LOBBY_INTERVAL_MS);
        schedulePartyDescriptionUpdate();
    }

    function cmdJugar(playerName) {
        if (GAME.phase!=='lobby') { w(playerName,'⚠ No hay ninguna partida abierta en este momento.'); return; }
        if (!isValidName(playerName)) { w(playerName,'⚠ Tu nombre contiene caracteres no permitidos. Solo letras, números, _ - y .'); return; }
        if (GAME.players.find(p=>p.name===playerName)) { w(playerName,'⚠ Ya estás en la partida.'); return; }
        if (GAME.players.length>=MAX_PLAYERS && !GAME.expanded) { w(playerName,'⚠ La partida ya está llena (18/18). Espera a que se use !expandir.'); return; }
        const sessions = loadSessions();
        GAME.players.push({ name:playerName, role:null, status:'alive', tired:false, pearls:0, mitmUser:sessions[playerName]||null, roleRevealed:false });
        w(playerName,`✔ ¡Te has unido a la partida! Jugadores: ${GAME.players.length}/18`);
        schedulePartyDescriptionUpdate();
    }

    function cmdComenzar() {
        if (GAME.phase!=='lobby') { pub('⚠ No hay ningún lobby abierto.'); return; }
        if (GAME.players.length<MIN_PLAYERS) { pub(`⚠ Se necesitan mínimo ${MIN_PLAYERS} jugadores (hay ${GAME.players.length}).`); return; }
        clearInterval(GAME.lobbyTimer);
        GAME.phase = 'starting';
        startGame();
    }

    /* ═══════════════════════════════════════════════════════════
       INICIO DEL JUEGO
       ═══════════════════════════════════════════════════════════ */
    function startGame() {
        // Los primeros 18 jugadores reciben un rol del setup; los extra son Inocentes
        const realRoles = shuffle(ROLES_DEF.filter(r => r.name !== 'Inocente'));
        GAME.players.forEach((p, i) => {
            p.role = i < realRoles.length ? realRoles[i] : INOCENTE_ROLE;
            GAME.roleState[p.name] = initRoleState(p.role.name);
        });
        GAME.players.forEach(p => w(p.name, buildRoleMsg(p)));
        const introLines = [
            '︶︶︶︶ ❕ ︶︶︶︶',
            '✧ ¡Hola! Soy Dot y seré su anfitrión en Mystery in the Meeting.',
            'Aquí deberán descubrir al equipo malvado escondido entre la reunión.',
            'Cada rol tiene herramientas únicas: úsenlas con estrategia para sobrevivir.',
            '︶︶︶︶ ❕ ︶︶︶︶',
            '✧ El juego tiene 3 fases:',
            '1) Fase nocturna 🌙: duermen y usan habilidades secretas.',
            '2) Fase diurna ☀: se reúnen, analizan pistas y debaten.',
            '3) Fase de votación 🗳️: deciden a quién expulsar de la reunión.',
            '︶︶︶︶ ❕ ︶︶︶︶',
            '✧ Todas las habilidades se usan por Whisper.',
            'Tu rol es privado: no lo reveles si quieres mantener ventaja.',
            '︶︶︶︶ ❕ ︶︶︶︶',
            '✧ Perlas y Mystery Shop:',
            'Las perlas son la moneda del juego para comprar objetos útiles.',
            'Se consiguen haciendo tareas (hasta 8 disponibles, 1-2 perlas por tarea).',
            'Trabajar consume energía: si quedas cansado, no podrás usar habilidad ese turno.',
            '︶︶︶︶ ❕ ︶︶︶︶',
        ];
        introLines.forEach(line => pub(line));
        pause(500);
        pub('✧ Todos los roles han sido otorgados.');
        pause(600);
        pub('La fase nocturna comenzará en 3 minutos, por favor, diríjanse a la casa y elijan una habitación.');
        schedulePartyDescriptionUpdate();
        setTimeout(() => startNightPhase(), NIGHT_START_DELAY);
    }

    /* ═══════════════════════════════════════════════════════════
       FASE NOCTURNA
       ═══════════════════════════════════════════════════════════ */
    function startNightPhase() {
        GAME.phase='night'; GAME.nightNum++;
        GAME.nightResults=[]; GAME.protections=[]; GAME.evilVotes={};
        GAME.pendingTurns=[]; GAME.turnsAttended=0; GAME.totalTurns=0; GAME.hexedRole=null;
        GAME.turnWindowClosed = new Set();
        GAME.ghostVotingEnabled = false;

        if (GAME.nightNum === 1) {
            const evilAlive = alive().filter(p => p.role.team === 'malos');
            evilAlive.forEach(ep => {
                const mates = evilAlive.filter(x => x.name !== ep.name).map(x => x.name);
                const mateMsg = mates.length ? mates.join(', ') : 'ninguno';
                w(ep.name, `☠️ Compañeros malvados: ${mateMsg}. No puedes votar para matar a tus compañeros.`);
            });
        }

        // Curandero: noche 5
        if (GAME.nightNum===5) {
            GAME.players.forEach(p => {
                if (p.role.name!=='Curandero') return;
                const rs = GAME.roleState[p.name];
                if (p.status==='dead' && rs && !rs.used) {
                    p.status='alive';
                    pub('🌕 ¡El Curandero ha vuelto a la vida gracias a la luna llena! ✧');
                    w(p.name,'🌕 ¡Has vuelto a la vida! La luna llena te ha resucitado. ✧');
                }
                if (p.status==='alive' && rs && rs.used && !rs.used2)
                    pub('🌕 ¡Es la noche 5! El Curandero puede resucitar a otro jugador. ✧');
            });
        }

        // Revertir disfraz si había uno activo
        if (GAME.disguiseRevert) {
            const dr=GAME.disguiseRevert; GAME.disguiseRevert=null;
            const dp=getP(dr.playerName);
            if (dp&&dp.status==='alive') { dp.role=dr.origRole; GAME.roleState[dr.playerName]=initRoleState(dr.origRole.name); }
        }
        pub('/time night'); pause(500);
        pub('✧ 👈 ¡Vamos a dormir! ... Es de noche 🌙'); pause(600);
        pub(`✧ Noche N.º ${GAME.nightNum} 🌑 ✧`); pause(600);
        pub('✦ ¡Shh! La noche ha comenzado. 🌙 Todos en su habitación. ¡No se muevan y descansen! Usen: /zzz'); pause(800);
        pub('► Enviando turnos al Whisper...'); pause(1200);
        schedulePartyDescriptionUpdate();
        sendNightTurns();
    }

    function sendNightTurns() {
        const alv = alive();
        const indRoles = ['Cupido','Curandero','Chef','Detective','Guardaespaldas','Justiciero','Médico','Melómano','Espía','Pirómano'];
        let turnNum = 1;
        alv.forEach(p => {
            if (!indRoles.includes(p.role.name)) return;
            const rs = GAME.roleState[p.name];
            if (p.role.name==='Cupido'  && (rs.used || GAME.nightNum>2)) return;
            if (p.role.name==='Chef'    && rs.tomatoes<=0)               return;
            if (p.role.name==='Espía'   && rs.killedAlready)             return;
            if (GAME.frozenPlayer===p.name) { w(p.name,'❄ Estás congelado y no puedes usar habilidad este turno.'); return; }
            if (GAME.hexedRole===p.role.name) { w(p.name,'⚠ Tu habilidad ha sido bloqueada por el Jorguín esta fase. Descansa.'); return; }
            if (rs.blockedByMelomano)         { rs.blockedByMelomano=false; w(p.name,'⚠ Tu habilidad fue bloqueada (Melómano). Descansa.'); return; }
            // Cansado: marcar turno como respondido automáticamente
            if (p.tired) {
                w(p.name,'¡Estás exhausto por trabajar! 💤 No puedes usar tu habilidad. Tu turno se ha marcado como respondido. ✔️');
                const tId=`${p.name}_n${GAME.nightNum}`;
                GAME.pendingTurns.push({id:tId, playerName:p.name, role:p.role.name, responded:true});
                GAME.turnsAttended++;
                return;
            }
            w(p.name, buildTurnWhisperText(turnNum++, buildTurnMsg(p)));
            GAME.pendingTurns.push({id:`${p.name}_n${GAME.nightNum}`, playerName:p.name, role:p.role.name, responded:false});
        });

        // Turno colectivo malvado
        const evilAlive = alv.filter(p=>p.role.team==='malos');
        if (evilAlive.length>0) {
            evilAlive.forEach(ep => {
                const baseMsg = ep.role.name==='Asesino' ? buildTurnMsg(ep) : '【🎃】 Malvados, voten por el jugador al cual quieran matar esta noche (solo el nombre) ...';
                w(ep.name, buildTurnWhisperText(turnNum++, baseMsg));
            });
            GAME.pendingTurns.push({id:`malvados_n${GAME.nightNum}`, playerName:'malvados', role:'Malvados', responded:false, votes:0, needed:evilAlive.length});
        }

        GAME.totalTurns = GAME.pendingTurns.length;
        pub('¡Todos los turnos han sido enviados! ✔'); pause(500);
        pub('✧ Tienen 60 segundos para responder.');
        GAME.turnTimeoutTimer = setTimeout(() => { if (GAME.phase==='night') finishNightPhase(); }, TURN_TIMEOUT);
    }

    /* ═══════════════════════════════════════════════════════════
       FIN FASE NOCTURNA
       ═══════════════════════════════════════════════════════════ */
    function finishNightPhase() {
        clearTimeout(GAME.turnTimeoutTimer);
        if (GAME.phase!=='night') return;
        GAME.pendingTurns.filter(t=>!t.responded && t.playerName!=='malvados').forEach(t=>GAME.turnWindowClosed.add(t.playerName));

        // Objetivo equipo malvado (Asesino tiene prioridad)
        let evilTarget=null;
        const aliveMalos = alive().filter(p=>p.role.team==='malos');
        const asesino = aliveMalos.find(p=>p.role.name==='Asesino');
        if (asesino && GAME.evilVotes[asesino.name]) {
            evilTarget = GAME.evilVotes[asesino.name];
        } else {
            const tally={};
            Object.values(GAME.evilVotes).forEach(t=>{tally[t]=(tally[t]||0)+1;});
            let max=0;
            Object.entries(tally).forEach(([n,c])=>{if(c>max){max=c;evilTarget=n;}});
        }

        // Pirómano es inmune
        if (evilTarget && getP(evilTarget)?.role.name==='Pirómano') evilTarget=null;

        // Verificar protecciones
        if (evilTarget) {
            // Pócima de sanación activa
            const pocima = (GAME.items[evilTarget]||[]).find(it=>it.id==='pocima_activa');
            if (pocima) {
                GAME.items[evilTarget] = GAME.items[evilTarget].filter(it=>it!==pocima);
                pub(`🧪 ¡La Pócima de Sanación salvó a ${evilTarget} del ataque!`);
                evilTarget=null;
            }
        }
        if (evilTarget) {
            const prot = GAME.protections.find(pr=>pr.target===evilTarget);
            if (prot) {
                pub('⚠ El objetivo del equipo malvado fue protegido. ❌');
                applyProtectorDamage(prot);
                evilTarget=null;
            }
        }

        // Tomate: revelar sospechosos
        if (evilTarget) {
            const tRS = GAME.roleState[evilTarget];
            if (tRS?.hasTomato) {
                const sosp = aliveMalos.slice(0,2).map(p=>p.name).join(' y ');
                GAME.nightResults.push({name:evilTarget, cause:'evil', tomato:true, sospechosos:sosp});
            } else {
                GAME.nightResults.push({name:evilTarget, cause:'evil'});
            }
            killPlayer(evilTarget,'evil');
        }

        // Espía kills
        GAME.players.filter(p=>p.role.name==='Espía' && GAME.roleState[p.name]?.pendingKill).forEach(p => {
            const rs=GAME.roleState[p.name], target=rs.pendingKill; rs.pendingKill=null;
            const tp=getP(target);
            if (tp&&tp.status==='alive') {
                const prot=GAME.protections.find(pr=>pr.target===target);
                if (prot){pub('⚠ La víctima del Espía fue protegida. ❌'); applyProtectorDamage(prot);}
                else {GAME.nightResults.push({name:target,cause:'espia'}); killPlayer(target,'espia');}
            }
        });

        // Pirómano incendio
        const piroP = alive().find(p=>p.role.name==='Pirómano');
        if (piroP) {
            const rs = GAME.roleState[piroP.name];
            if (rs.igniteThisNight) {
                rs.igniteThisNight=false;
                rs.drenched.filter(n=>getP(n)?.status==='alive').forEach(name=>{
                    GAME.nightResults.push({name,cause:'piromano'}); killPlayer(name,'piromano');
                });
                rs.drenched=[];
            }
        }

        // Efectos Melómano
        GAME.players.forEach(p => {
            const rs=GAME.roleState[p.name];
            if (!rs?.melomanoTarget) return;
            const tp=getP(rs.melomanoTarget);
            if (!tp||tp.status!=='alive') {rs.melomanoTarget=null; return;}
            if (tp.role.team==='malos') {
                if (!GAME.roleState[tp.name]) GAME.roleState[tp.name]={};
                GAME.roleState[tp.name].blockedByMelomano=true;
                w(tp.name,'¡Te has distraído en la música y tu habilidad ha sido bloqueada! 🚫');
            } else {
                tp.pearls=(tp.pearls||0)+1;
                w('Sellerhoove ⚙', `!p 1 ${tp.name}`);
                w(tp.name,`✧ ¡La música te ha inspirado! Has ganado 1 perla extra. ⚪`);
            }
            rs.melomanoTarget=null;
        });

        if (checkWinCondition()) return;
        startDayPhase();
    }

    function applyProtectorDamage(prot) {
        const protector=getP(prot.protector);
        if (!protector||protector.status==='dead') return;
        if (prot.type==='guardaespaldas') {
            const rs=GAME.roleState[prot.protector];
            if (rs) {
                rs.health--;
                if (rs.health<=0) killPlayer(prot.protector,'guardaespaldas_fell');
                else w(prot.protector,'Has sido atacado y has quedado herido. ¡Otro ataque más y morirás! ⛄');
            }
        } else if (prot.type==='justiciero') {
            killPlayer(prot.protector,'justiciero_fell');
        }
    }

    /* ═══════════════════════════════════════════════════════════
       FASE DIURNA
       ═══════════════════════════════════════════════════════════ */
    function startDayPhase() {
        GAME.phase='day'; GAME.dayNum++;
        GAME.pendingTurns=[]; GAME.turnsAttended=0; GAME.totalTurns=0; GAME.skipVotes=new Set();
        GAME.turnWindowClosed = new Set();

        pub('/time day'); pause(400);
        pub(`✧ ¡Es de día! ☀ N.º ${GAME.dayNum}`); pause(700);

        if (GAME.nightResults.length>0) {
            GAME.nightResults.forEach(r => {
                if (r.cause==='piromano') pub(`🔥 ¡El Pirómano ha incendiado a ${r.name}!`);
                else pub(`🎃 ¡El Equipo Malvado ha matado a ${r.name}!`);
                if (r.tomato) { pause(400); pub(`🍅 ¡${r.name} tenía un tomate! Sospechosos: ${r.sospechosos}`); }
                pause(500);
            });
        } else { pub('✧ Ningún jugador ha muerto la noche anterior. 🎉'); }
        GAME.nightResults=[];

        const asesino=alive().find(p=>p.role.name==='Asesino');
        if (asesino) { pause(400); w(asesino.name,'🔪 ¡Al comenzar la reunión has recibido una daga totalmente gratis!'); }

        pause(10000);
        pub('¡La fase de discusión comienza! ☀'); pause(600);
        pub('✦ Todos diriganse a la mesa, se enviarán turnos diurnos en 2 minutos. ☀');
        schedulePartyDescriptionUpdate();
        setTimeout(sendDayTurns, DAY_TURN_DELAY);
    }

    function sendDayTurns() {
        if (GAME.phase!=='day') return;
        pub('► Enviando turnos diurnos (☀) al Whisper...'); pause(1200);
        const alv=alive(), dayTurnTypes=['diurno','multiturno'];
        let turnNum = 1;
        alv.forEach(p => {
            if (!dayTurnTypes.includes(p.role.turn)) return;
            const rs=GAME.roleState[p.name];
            if (GAME.frozenPlayer===p.name) { w(p.name,'❄ Estás congelado y no puedes usar habilidad este turno.'); return; }
            if (rs?.blockedByMelomano) { rs.blockedByMelomano=false; w(p.name,'⚠ Tu habilidad ha sido bloqueada (Melómano). Descansa.'); return; }
            if (GAME.hexedRole===p.role.name) { w(p.name,'⚠ Tu habilidad ha sido hechizada por el Jorguín. Descansa.'); return; }
            if (p.role.name==='Psíquico'  && rs?.actions<=0) return;
            if (p.role.name==='Alguacil'  && rs?.bulletUsed && rs?.revealUsed) return;
            // Cansado: marcar turno como respondido automáticamente
            if (p.tired) {
                w(p.name,'¡Estás exhausto por trabajar! 💤 No puedes usar tu habilidad. Tu turno se ha marcado como respondido. ✔️');
                const tId=`${p.name}_d${GAME.dayNum}`;
                GAME.pendingTurns.push({id:tId, playerName:p.name, role:p.role.name, responded:true});
                GAME.turnsAttended++;
                return;
            }
            w(p.name, buildTurnWhisperText(turnNum++, buildTurnMsg(p)));
            GAME.pendingTurns.push({id:`${p.name}_d${GAME.dayNum}`, playerName:p.name, role:p.role.name, responded:false});
        });
        GAME.totalTurns=GAME.pendingTurns.length;
        pub('¡Todos los turnos han sido enviados! ✔'); pause(500);
        pub('✧ Tienen 60 segundos para responder.'); pause(3000);
        pub('¡Estamos en la fase de discusión! Recuerda dialogar con los demás jugadores en esta fase. ✦'); pause(500);
        pub('Di "!skip" para votar por saltar esta fase.');
        GAME.turnTimeoutTimer=setTimeout(() => { if (GAME.phase==='day') startVotingPhase(); }, TURN_TIMEOUT);
    }

    function finishDayPhase() {
        clearTimeout(GAME.turnTimeoutTimer);
        if (GAME.phase!=='day') return;
        GAME.pendingTurns.filter(t=>!t.responded).forEach(t=>GAME.turnWindowClosed.add(t.playerName));
        startVotingPhase();
    }

    /* ═══════════════════════════════════════════════════════════
       FASE DE VOTACIÓN
       ═══════════════════════════════════════════════════════════ */
    function startVotingPhase() {
        GAME.phase='voting'; GAME.voteTally={}; GAME.votesMade={}; GAME.pendingTurns=[]; GAME.totalTurns=0; GAME.turnsAttended=0; GAME.mostVoted=null; GAME.skipVotes=new Set();
        GAME.turnWindowClosed = new Set();
        GAME.votingDeadline = null;

        // Enviar turnos de Espectro y Juez ANTES de que comience la votación pública
        const alv=alive();
        alv.filter(p=>p.role.turn==='votacion'&&(p.role.name==='Espectro'||p.role.name==='Juez')).forEach(p=>{
            const rs=GAME.roleState[p.name];
            if (p.role.name==='Espectro' && rs.used) return;
            if (p.role.name==='Juez' && rs.revealed) return;
            const msg = p.role.name==='Espectro'
                ? '【👻】 Espectro, antes de que comience la votación: ¿deseas "provocar" el fenómeno hoy (los muertos votan) o "guardar" tu habilidad? ...'
                : '【🏳】 Juez(a), antes de que comience la votación: ¿deseas "revelar" tu identidad ahora (tu voto valdrá doble) o "esperar"? ...';
            w(p.name, buildTurnWhisperText(1, msg));
            GAME.pendingTurns.push({id:`${p.name}_pre_v${GAME.dayNum}`, playerName:p.name, role:p.role.name, responded:false});
        });

        // Esperar a que respondan (o pausar 20s) antes de anunciar la votación
        const preVotingWait = GAME.pendingTurns.length > 0 ? 20_000 : 20_000;
        pub('🗞️ La fase de votación iniciará en 20 segundos. Todos diríjanse a la mesa de votación.');
        pause(preVotingWait);

        setTimeout(() => {
            // Marcar turnos prevotación como respondidos si no lo han sido
            GAME.pendingTurns.forEach(t=>{ if(!t.responded) t.responded=true; });
            GAME.pendingTurns=[]; GAME.totalTurns=0; GAME.turnsAttended=0;

            pub('🔔 La votación ha comenzado. Tienen 60 segundos.'); pause(300);
            pub('► Usa !votar [jugador] para votar · !v [jugador] · !skip para votar SKIP.');
            pub('► También puedes usar !skip para votar SKIP.');
            GAME.votingDeadline = Date.now() + VOTING_DURATION;
            setTimeout(resolveVoting, VOTING_DURATION);
        }, preVotingWait);
    }

    function getVotingPlayers() {
        return GAME.players.filter(p => p.status==='alive' || (GAME.ghostVotingEnabled && p.status==='dead' && p.role?.team==='buenos'));
    }

    function canVote(voter) {
        if (!voter) return false;
        if (voter.status==='alive') return true;
        return !!(GAME.ghostVotingEnabled && voter.status==='dead' && voter.role?.team==='buenos');
    }

    function buildVoteCountLine() {
        const candidates = alive().map(p => p.name);
        const segments = candidates
            .filter(name => (GAME.voteTally[name] || 0) > 0)
            .map(name => `${name}: ${GAME.voteTally[name] || 0}v`);
        segments.push(`SKIP: ${GAME.voteTally._skip || 0}v`);
        return `(🗞) ${segments.join(' || ')}`;
    }

    function registerVote(voterName, targetName) {
        if (GAME.phase!=='voting') return;
        if (GAME.votingDeadline && Date.now()>GAME.votingDeadline) { w(voterName,'⚠ Llegaste tarde: la votación ya cerró.'); return; }
        const voter=getP(voterName);
        if (!canVote(voter)) return;
        if (GAME.frozenPlayer===voterName) { w(voterName,'❄ Estás congelado y no puedes votar.'); return; }
        if (GAME.votesMade[voterName]) { w(voterName,'⚠ Ya votaste en esta ronda y no puedes cambiar tu voto.'); return; }
        // Manoplas: voto vale +1
        const hasManoplas = (GAME.items[voterName]||[]).some(it=>it.id==='manoplas'&&it.active);
        // Reloj de arena: skip forzado
        if (targetName==='skip' || targetName==='_skip') {
            const weight = hasManoplas ? 2 : 1;
            GAME.votesMade[voterName]='_skip';
            GAME.skipVotes.add(voterName);
            GAME.voteTally._skip = (GAME.voteTally._skip || 0) + weight;
            pub(`🗳 ${voterName} ha votado por SKIP.`);
            pub(buildVoteCountLine());
            return;
        }
        let finalTarget=targetName;
        if (GAME.controlledVote?.player===voterName) finalTarget=GAME.controlledVote.voteFor;
        GAME.votesMade[voterName]=finalTarget;
        GAME.voteTally[finalTarget]=(GAME.voteTally[finalTarget]||0)+1;
        if (voter.role.name==='Juez' && GAME.roleState[voterName]?.revealed && finalTarget!==voterName)
            GAME.voteTally[finalTarget]++;
        if (hasManoplas) GAME.voteTally[finalTarget]++;
        pub(`🗳 ${voterName} ha votado por ${finalTarget}.`);
        pub(buildVoteCountLine());
    }

    function resolveVoting() {
        if (GAME.phase!=='voting') return;
        const tally = { ...GAME.voteTally, _skip: GAME.voteTally._skip || 0 };
        let max=0;
        Object.values(tally).forEach(c=>{ if (c>max) max=c; });
        const leaders = Object.entries(tally).filter(([,c])=>c===max && c>0).map(([n])=>n);
        GAME.voteLeaders = leaders;
        GAME.mostVoted = leaders.length===1 ? leaders[0] : null;
        pub('La votación ha terminado. 🔔'); pause(500);
        pub(buildVoteCountLine());
        if (!leaders.length) pub('✧ No se emitieron votos. Nadie será ejecutado.');
        else if (leaders.includes('_skip')) pub('✧ SKIP fue el más votado. Nadie será ejecutado.');
        else if (leaders.length>1) pub('✧ Hubo empate en la votación. Nadie será ejecutado.');
        else pub(`El jugador ${leaders[0]} ha sido el más votado.`);
        pause(600);
        sendVotingRoleTurns();
    }

    function sendVotingRoleTurns() {
        const alv=alive();
        let turnNum = 1;
        const canExecute = !!(GAME.mostVoted && GAME.mostVoted !== '_skip' && !!getP(GAME.mostVoted));
        alv.filter(p=>p.role.turn==='votacion').forEach(p => {
            const rs=GAME.roleState[p.name];
            if (p.role.name==='Secuaz' && (!canExecute||rs.used)) return;
            if (p.role.name==='Juez'   && (!canExecute||rs.cancelUsed)) return;
            if (p.role.name==='Espectro') return;
            w(p.name, buildTurnWhisperText(turnNum++, buildTurnMsg(p)));
            GAME.pendingTurns.push({id:`${p.name}_v${GAME.dayNum}`, playerName:p.name, role:p.role.name, responded:false});
        });
        GAME.totalTurns=GAME.pendingTurns.length;
        if (GAME.totalTurns===0) { executeExecution(); return; }
        setTimeout(executeExecution, 20000);
    }

    function executeExecution() {
        if (GAME.phase!=='voting') return;
        GAME.pendingTurns.forEach(t=>{t.responded=true;});
        if (GAME.voteLeaders?.includes('_skip') || (GAME.voteLeaders && GAME.voteLeaders.length>1)) {
            pub('✧ No habrá ejecución en esta ronda.');
            GAME.mostVoted=null;
        } else if (GAME.mostVoted) {
            const ep=getP(GAME.mostVoted);
            // Bomba de humo: salva de la ejecución
            const bomba = (GAME.items[GAME.mostVoted]||[]).find(it=>it.id==='bomba_humo');
            if (bomba) {
                GAME.items[GAME.mostVoted] = GAME.items[GAME.mostVoted].filter(it=>it!==bomba);
                pub(`💨 ¡${GAME.mostVoted} ha usado una Bomba de Humo y ha escapado del linchamiento!`);
                GAME.mostVoted=null;
            } else {
                killPlayer(GAME.mostVoted,'vote');
                pub(`⚖️ ¡${GAME.mostVoted} ha sido ejecutado por votación!`);
                if (ep) { ep.roleRevealed=true; schedulePartyDescriptionUpdate(); pause(500); pub(`✧ ${GAME.mostVoted} era: ${ep.role.emoji} ${ep.role.name} (${ep.role.team==='buenos'?'🛡️ Bueno':ep.role.team==='malos'?'☠️ Malvado':'👤 Solitario'})`); }
            }
        } else { pub('✧ Ningún jugador ha sido ejecutado hoy.'); }
        if (checkWinCondition()) return;
        GAME.frozenPlayer=null; GAME.controlledVote=null;
        // 10 segundos de pausa antes de las tareas (para que los jugadores vean el rol revelado)
        pause(10_000);
        setTimeout(() => { if (GAME.phase==='voting') { GAME.phase='post_exec'; startTasksPhase(); } }, 10_000);
    }

    /* ═══════════════════════════════════════════════════════════
       FASE DE TAREAS
       ═══════════════════════════════════════════════════════════ */
    function startTasksPhase() {
        GAME.phase='tasks'; // Viene de 'voting' o 'post_exec'
        pub('/time sunset'); pause(400);
        pub('✧ ¡Las tareas se han abierto! 📚'); pause(500);
        pub('✦ Tienen 10 minutos para completar sus tareas.');
        schedulePartyDescriptionUpdate();
        GAME.taskWarnTimer = setTimeout(() => {
            if (GAME.phase==='tasks') pub('Quedan 5 minutos para terminar las tareas. 📚');
        }, TASKS_WARNING_AT);
        GAME.taskTimer=setTimeout(() => { if (GAME.phase==='tasks') finishTasksPhase(); }, TASKS_DURATION); // Tarea inicia aquí, la fase ya es 'tasks'
    }

    function finishTasksPhase() {
        clearTimeout(GAME.taskTimer);
        clearTimeout(GAME.taskWarnTimer);
        if (GAME.phase!=='tasks') return;
        GAME.players.forEach(p=>{p.tired=false;});
        pub('🔔 La fase de tareas ha terminado.');
        pause(300);
        pub('🌙 La fase nocturna comenzará en 2 minutos. Regresen a casa.');
        schedulePartyDescriptionUpdate();
        GAME.nextNightTimer = setTimeout(() => {
            if (GAME.phase==='tasks') startNightPhase();
        }, TASKS_TO_NIGHT_DELAY);
    }

    /* ═══════════════════════════════════════════════════════════
       TURNO ATENDIDO
       ═══════════════════════════════════════════════════════════ */
    let counterDebounce=null;
    function markAttended(idOrName) {
        const turn=GAME.pendingTurns.find(t=>(t.id===idOrName||t.playerName===idOrName)&&!t.responded);
        if (!turn) return;
        turn.responded=true; GAME.turnsAttended++;
        if (counterDebounce) clearTimeout(counterDebounce);
        counterDebounce=setTimeout(() => { pub(`Turnos atendidos: ${GAME.turnsAttended}/${GAME.totalTurns} ✦`); }, 250);
        if (GAME.pendingTurns.every(t=>t.responded)) {
            clearTimeout(GAME.turnTimeoutTimer);
            setTimeout(() => {
                if (GAME.phase==='night') finishNightPhase();
                else if (GAME.phase==='day') startVotingPhase();
            }, 600);
        }
    }

    /* ═══════════════════════════════════════════════════════════
       PROCESAMIENTO DE WHISPERS
       ═══════════════════════════════════════════════════════════ */
    function onWhisper(senderName, rawText) {
        const text=rawText.trim(), textL=text.toLowerCase();

        // Confirmaciones pendientes (sugerencia / daga / megáfono)
        if (GAME.pendingConfs[senderName]) {
            const conf=GAME.pendingConfs[senderName];
            if (handleItemConf(senderName, text, conf)) return;
            // Daga: elige a quién llevarse
            if (conf.daga) {
                const target=findPlayer(text, alive());
                if (!target) { w(senderName,'⚠ Jugador no encontrado. Escribe el nombre del jugador:'); return; }
                if (!target.exact) { suggest(senderName,target.player.name,()=>onWhisper(senderName,target.player.name)); return; }
                delete GAME.pendingConfs[senderName];
                killPlayer(target.player.name,'daga');
                pub(`🗡 ¡${senderName} cayó con su Daga y se llevó a ${target.player.name} consigo!`);
                checkWinCondition(); return;
            }
            // Megáfono: revela rol de un jugador al morir
            if (conf.megafono) {
                const target=findPlayer(text, GAME.players);
                if (!target) { w(senderName,'⚠ Jugador no encontrado.'); return; }
                delete GAME.pendingConfs[senderName];
                target.player.roleRevealed=true;
                pub(`📢 ¡El Megáfono de ${senderName} revela que ${target.player.name} es ${target.player.role?.emoji} ${target.player.role?.name}!`);
                schedulePartyDescriptionUpdate();
                return;
            }
            // Sugerencia de nombre estándar
            if (textL==='si'||textL==='sí') { delete GAME.pendingConfs[senderName]; conf.action && conf.action(); }
            else if (textL==='no')           { delete GAME.pendingConfs[senderName]; w(senderName,'❌ Acción cancelada.'); }
            return;
        }

        // Comando "!usar X" para ítems desde whisper
        if (textL.startsWith('!usar ') || textL.startsWith('usar ')) {
            const itemArg = text.trim().split(/\s+/).slice(1).join(' ');
            const player2 = getP(senderName);
            const itemId = resolveItemId(itemArg);
            if (!itemId) { w(senderName,'⚠ Ítem no reconocido. Usa !usar [número o nombre].'); return; }
            if (player2) { useItem(player2, itemId, ''); return; }
        }

        // Comandos de cuenta por whisper
        if (textL.startsWith('!login '))  { cmdLogin(senderName, text.split(/\s+/)[1]); return; }
        if (textL.startsWith('!logout'))  { cmdLogout(senderName); return; }
        if (textL==='!data')              { cmdData(senderName); return; }
        if (textL==='!sintareas' && GAME.phase==='tasks') { finishTasksPhase(); return; }

        // Retaliation Justiciero
        if (GAME.justicieroKill?.killer===senderName) {
            const target=findPlayer(text, alive().filter(p=>p.role.team==='malos'));
            if (!target) { w(senderName,'⚠ No encontré ese jugador malvado.'); return; }
            if (!target.exact) { suggest(senderName,target.player.name,()=>onWhisper(senderName,target.player.name)); return; }
            killPlayer(target.player.name,'justiciero_retaliation');
            pub(`⚔ ¡El Justiciero se ha llevado a ${target.player.name} consigo mismo!`);
            GAME.justicieroKill=null; checkWinCondition(); return;
        }

        // Bonus kill Secuaz
        if (GAME.secuazBonusKill) {
            const secuaz=GAME.players.find(p=>p.role.name==='Secuaz'&&p.name===senderName);
            if (secuaz) {
                const target=findAlive(text, senderName);
                if (!target) { w(senderName,'⚠ Jugador no encontrado.'); return; }
                if (!target.exact) { suggest(senderName,target.player.name,()=>onWhisper(senderName,target.player.name)); return; }
                killPlayer(target.player.name,'secuaz_bonus');
                pub(`🗡 ¡El Secuaz ha eliminado a ${target.player.name} como bono!`);
                GAME.secuazBonusKill=false; checkWinCondition(); return;
            }
        }

        const player=getP(senderName);
        if (!player || player.status!=='alive' || !player.role) return;

        // Verificar que el jugador tiene un turno pendiente en la fase actual
        // antes de pasar a los procesadores (evita errores por mensajes inesperados)
        const hasPendingTurn = GAME.pendingTurns.some(t => {
            if (t.responded) return false;
            // Turno individual del jugador
            if (t.playerName === player.name) return true;
            // Turno colectivo de malvados
            if (t.playerName === 'malvados' && player.role.team === 'malos') return true;
            return false;
        });

        if (!hasPendingTurn) {
            if (GAME.turnWindowClosed.has(player.name) && (GAME.phase==='night' || GAME.phase==='day')) {
                w(player.name,'⏰ Respondiste demasiado tarde. Debes esperar a tu próximo turno.');
            }
            return;
        }

        switch(GAME.phase) {
            case 'night':  processNightTurn(player, text); break;
            case 'day':    processDayTurn(player, text);   break;
            case 'voting': processVotingTurn(player, text);break;
        }
    }

    /* ─── TURNOS NOCTURNOS ─────────────────────────────────── */
    function processNightTurn(player, text) {
        const role=player.role.name, rs=GAME.roleState[player.name], textL=text.toLowerCase().trim();
        const turn=GAME.pendingTurns.find(t=>t.playerName===player.name&&!t.responded);
        const abilityCheck = canUseAbility(player);
        if (!abilityCheck.ok && turn) { w(player.name, abilityCheck.reason); markAttended(turn.id); return; }

        // ── Espía: turno individual ANTES del check de equipo malvado ──
        if (role==='Espía') {
            const spyTurn=GAME.pendingTurns.find(t=>t.playerName===player.name&&!t.responded);
            if (spyTurn) {
                // Turno individual pendiente: requiere formato "espiar Nombre" o "matar"
                if (textL==='matar') {
                    if (!rs.canKill||!rs.lastSpy) { w(player.name,'⚠ Debes espiar a alguien primero antes de matar.'); return; }
                    rs.pendingKill=rs.lastSpy; rs.killedAlready=true;
                    w(player.name,`✔ ¡Has decidido matar a ${rs.lastSpy} esta noche!`);
                    markAttended(spyTurn.id);
                } else if (textL.startsWith('espiar ')) {
                    const targetTxt=text.slice(7).trim();
                    if (rs.killedAlready) { w(player.name,'⚠ Ya mataste. No puedes volver a espiar.'); markAttended(spyTurn.id); return; }
                    const res=findAlive(targetTxt,player.name);
                    if (!res) { w(player.name,'⚠ Jugador no encontrado. Usa: "espiar Nombre"'); return; }
                    if (!res.exact) { suggest(player.name,res.player.name,()=>processNightTurn(player,`espiar ${res.player.name}`)); return; }
                    rs.lastSpy=res.player.name; rs.canKill=true;
                    w(player.name,`✧ ¡Has espiado a ${res.player.name} y has descubierto que es ... ${res.player.role.emoji} ${res.player.role.name}!`);
                    markAttended(spyTurn.id);
                } else {
                    w(player.name,'⚠ Usa "espiar Nombre" para espiar, o "matar" para eliminar al último espiado.');
                }
                return;
            }
            // Turno individual ya respondido → puede votar con el equipo malvado
            processEvilVote(player, text);
            return;
        }

        // Otros malvados → voto colectivo
        if (player.role.team==='malos') { processEvilVote(player,text); return; }

        if (!turn) return;

        switch(role) {
            case 'Detective': {
                const res=findAlive(text,player.name);
                if (!res) { w(player.name,'⚠ Jugador no encontrado.'); return; }
                if (!res.exact) { suggest(player.name,res.player.name,()=>processNightTurn(player,res.player.name)); return; }
                w(player.name,`✧ ¡Has investigado a ${res.player.name} y has descubierto que es ... ${res.player.role.emoji} ${res.player.role.name}!`);
                markAttended(turn.id); break;
            }
            case 'Médico': {
                const res=findAlive(text,player.name);
                if (!res) { w(player.name,'⚠ Jugador no encontrado.'); return; }
                if (!res.exact) { suggest(player.name,res.player.name,()=>processNightTurn(player,res.player.name)); return; }
                if (rs.lastProtected===res.player.name) {
                    rs.consecutive=(rs.consecutive||0)+1;
                    if (rs.consecutive>=2) { w(player.name,'Ya has protegido 2 veces seguidas a este jugador. Protege a otro. 💊'); return; }
                } else rs.consecutive=0;
                rs.lastProtected=res.player.name;
                GAME.protections.push({target:res.player.name, protector:player.name, type:'medico'});
                w(player.name,`✔️ Estás protegiendo a ${res.player.name}.`);
                markAttended(turn.id); break;
            }
            case 'Guardaespaldas': {
                const parts=text.trim().split(/\s+/);
                if (parts.length<2) { w(player.name,'⚠ Escribe 2 jugadores: "Jugador1 Jugador2"'); return; }
                const r1=findAlive(parts[0],player.name), r2=findAlive(parts.slice(1).join(' '),player.name);
                if (!r1||!r2) { w(player.name,'⚠ No encontré a uno de los jugadores.'); return; }
                if (!r1.exact||!r2.exact) { suggest(player.name,`${r1.player.name} y ${r2.player.name}`,()=>processNightTurn(player,`${r1.player.name} ${r2.player.name}`)); return; }
                GAME.protections.push({target:r1.player.name, protector:player.name, type:'guardaespaldas'});
                GAME.protections.push({target:r2.player.name, protector:player.name, type:'guardaespaldas'});
                w(player.name,`✔️ Estás protegiendo a ${r1.player.name} y ${r2.player.name}.`);
                markAttended(turn.id); break;
            }
            case 'Justiciero': {
                const res=findAlive(text,player.name);
                if (!res) { w(player.name,'⚠ Jugador no encontrado.'); return; }
                if (!res.exact) { suggest(player.name,res.player.name,()=>processNightTurn(player,res.player.name)); return; }
                GAME.protections.push({target:res.player.name, protector:player.name, type:'justiciero'});
                w(player.name,`✔️ Estás protegiendo a ${res.player.name}.`);
                markAttended(turn.id); break;
            }
            case 'Cupido': {
                if (rs.used) { w(player.name,'⚠ Ya usaste tu habilidad esta partida.'); markAttended(turn.id); return; }
                if (GAME.nightNum>2) { w(player.name,'⚠ Solo puedes flechar en la noche 1 o 2.'); markAttended(turn.id); return; }
                const parts=text.trim().split(/\s+/);
                if (parts.length<2) { w(player.name,'⚠ Escribe 2 jugadores: "Jugador1 Jugador2"'); return; }
                const r1=findAlive(parts[0],player.name), r2=findAlive(parts.slice(1).join(' '),player.name);
                if (!r1||!r2) { w(player.name,'⚠ No encontré a uno de los jugadores.'); return; }
                rs.used=true; GAME.cupidoPair=[r1.player.name, r2.player.name];
                w(player.name,`✧ ¡Has flechado a ${r1.player.name} y ${r2.player.name} con éxito! 💝`);
                w(r1.player.name,`✧ ¡Has sido flechado con ${r2.player.name}! Ahora ambos están enlazados. 💕`);
                w(r2.player.name,`✧ ¡Has sido flechado con ${r1.player.name}! Ahora ambos están enlazados. 💕`);
                markAttended(turn.id); break;
            }
            case 'Curandero': {
                if (textL==='no') { markAttended(turn.id); return; }
                const deadP=dead();
                if (!deadP.length) { w(player.name,'¡No hay ningún jugador muerto al cual revivir! ❌'); return; }
                const target=findPlayer(text,deadP);
                if (!target) { w(player.name,'⚠ No encontré ese jugador entre los muertos.'); return; }
                if (!target.exact) { suggest(player.name,target.player.name,()=>processNightTurn(player,target.player.name)); return; }
                if (rs.used&&rs.used2) { w(player.name,'⚠ Ya has agotado todos tus usos de resurrección.'); return; }
                if (rs.used&&GAME.nightNum<5) { w(player.name,'⚠ Tu segundo uso se desbloquea en la noche 5.'); return; }
                target.player.status='alive';
                if (!rs.used) rs.used=true; else rs.used2=true;
                w(target.player.name,`✧ ¡Has sido resucitado por el Curandero (${player.name})! ❤️‍🩹 Él sabe quién eres.`);
                pub(`✧ ¡El jugador ${target.player.name} ha sido resucitado por el Curandero! ❤️‍🩹`);
                markAttended(turn.id); break;
            }
            case 'Chef': {
                if (textL==='no'||rs.tomatoes<=0) { markAttended(turn.id); return; }
                const res=findAlive(text,player.name);
                if (!res) { w(player.name,'⚠ Jugador no encontrado.'); return; }
                if (!res.exact) { suggest(player.name,res.player.name,()=>processNightTurn(player,res.player.name)); return; }
                rs.tomatoes--;
                if (!GAME.roleState[res.player.name]) GAME.roleState[res.player.name]={};
                GAME.roleState[res.player.name].hasTomato=true;
                w(player.name,`✔ ¡Le has dado un tomate a ${res.player.name}!`);
                w(res.player.name,'✧ ¡Has recibido un tomate! Se ha guardado el objeto en tu bolsillo. 🍅');
                markAttended(turn.id); break;
            }
            case 'Melómano': {
                const res=findAlive(text,player.name);
                if (!res) { w(player.name,'⚠ Jugador no encontrado.'); return; }
                if (!res.exact) { suggest(player.name,res.player.name,()=>processNightTurn(player,res.player.name)); return; }
                if (rs.lastTarget===res.player.name) { w(player.name,'⚠ No puedes enviar música al mismo jugador dos veces seguidas.'); return; }
                rs.lastTarget=res.player.name; rs.melomanoTarget=res.player.name;
                w(player.name,`✔ Le has colocado música a ${res.player.name}.`);
                markAttended(turn.id); break;
            }
            case 'Pirómano': {
                if (textL==='incendiar') {
                    if (!rs.drenched.length) { w(player.name,'⚠ No hay jugadores encharcados todavía.'); return; }
                    rs.igniteThisNight=true;
                    w(player.name,`🔥 ¡Incendiando a: ${rs.drenched.join(', ')}!`);
                    markAttended(turn.id);
                } else {
                    const words=text.replace(/^encharcar\s*/i,'').split(/\s+/);
                    if (words.length<2) { w(player.name,'⚠ Escribe: "encharcar Jugador1 Jugador2"'); return; }
                    const r1=findAlive(words[0],player.name), r2=findAlive(words[1],player.name);
                    if (!r1||!r2) { w(player.name,'⚠ No encontré a uno de los jugadores.'); return; }
                    if (!rs.drenched.includes(r1.player.name)) rs.drenched.push(r1.player.name);
                    if (!rs.drenched.includes(r2.player.name)) rs.drenched.push(r2.player.name);
                    w(player.name,`¡Has encharcado a ${r1.player.name} y ${r2.player.name}! ✔️`);
                    markAttended(turn.id);
                }
                break;
            }

        }
    }

    function processEvilVote(player, text) {
        const malvTurn=GAME.pendingTurns.find(t=>t.playerName==='malvados'&&!t.responded);
        if (!malvTurn) return;
        const abilityCheck = canUseAbility(player);
        if (!abilityCheck.ok) { w(player.name, abilityCheck.reason); return; }
        const res=findAlive(text,player.name);
        if (!res) { w(player.name,'⚠ Jugador no encontrado. Escribe solo el nombre.'); return; }
        if (res.player.role.team === 'malos') { w(player.name,'⚠ No puedes votar para matar a un compañero malvado.'); return; }
        if (!res.exact) { suggest(player.name,res.player.name,()=>processEvilVote(player,res.player.name)); return; }
        GAME.evilVotes[player.name]=res.player.name;
        w(player.name,`✔ Has votado por ${res.player.name}.`);
        malvTurn.votes=(malvTurn.votes||0)+1;
        if (malvTurn.votes>=malvTurn.needed) markAttended(malvTurn.id);
    }

    /* ─── TURNOS DIURNOS ───────────────────────────────────── */
    function processDayTurn(player, text) {
        const role=player.role.name, rs=GAME.roleState[player.name];
        const turn=GAME.pendingTurns.find(t=>t.playerName===player.name&&!t.responded);
        if (!turn) return;
        const abilityCheck = canUseAbility(player);
        if (!abilityCheck.ok) { w(player.name, abilityCheck.reason); markAttended(turn.id); return; }

        switch(role) {
            case 'Androide': {
                const parts=text.trim().split(/\s+/);
                if (parts.length<2) { w(player.name,'⚠ Escribe 2 jugadores: "Jugador1 Jugador2"'); return; }
                const r1=findAlive(parts[0],player.name), r2=findAlive(parts.slice(1).join(' '),player.name);
                if (!r1||!r2) { w(player.name,'⚠ No encontré a uno de los jugadores.'); return; }
                w(player.name,`✧ ¡Has escaneado a ${r1.player.name} y ${r2.player.name}!`);
                const killers=Object.keys(GAME.evilVotes);
                const either=killers.includes(r1.player.name)||killers.includes(r2.player.name);
                if (either) w(player.name,'Se ha detectado que ambos o 1 jugador ha(n) matado la noche anterior. ❗');
                else        w(player.name,'Ninguno de los dos jugadores ha matado la noche anterior. 👍');
                markAttended(turn.id); break;
            }
            case 'Alguacil': {
                const parts=text.trim().split(/\s+/);
                const action=parts[0].toLowerCase(), targetTxt=parts.slice(1).join(' ');
                if (action==='disparar') {
                    if (rs.bulletUsed) { w(player.name,'⚠ Ya has usado tu bala.'); return; }
                    const res=findAlive(targetTxt,player.name);
                    if (!res) { w(player.name,'⚠ Jugador no encontrado.'); return; }
                    if (!res.exact) { suggest(player.name,res.player.name,()=>processDayTurn(player,`disparar ${res.player.name}`)); return; }
                    rs.bulletUsed=true; res.player.roleRevealed=true;
                    killPlayer(res.player.name,'alguacil');
                    pub(`¡Pow! 💥 ¡El Alguacil [${player.name}] le ha disparado a ${res.player.name}! Era: ${res.player.role.emoji} ${res.player.role.name}`);
                    schedulePartyDescriptionUpdate();
                    markAttended(turn.id); checkWinCondition();
                } else if (action==='desvelar') {
                    if (rs.revealUsed) { w(player.name,'⚠ Ya has desvelado un rol.'); return; }
                    const res=findAlive(targetTxt,player.name);
                    if (!res) { w(player.name,'⚠ Jugador no encontrado.'); return; }
                    if (!res.exact) { suggest(player.name,res.player.name,()=>processDayTurn(player,`desvelar ${res.player.name}`)); return; }
                    rs.revealUsed=true; res.player.roleRevealed=true;
                    pub(`✧ ¡El Alguacil ha desvelado el rol de ${res.player.name}! ⭐ Es ${res.player.role.emoji} ${res.player.role.name}.`);
                    schedulePartyDescriptionUpdate();
                    markAttended(turn.id);
                } else { w(player.name,'⚠ Usa: "disparar Jugador" o "desvelar Jugador"'); }
                break;
            }
            case 'Psíquico': {
                if (rs.actions<=0) { w(player.name,'⚠ Ya has agotado tus acciones.'); markAttended(turn.id); return; }
                const parts=text.trim().split(/\s+/), action=parts[0].toLowerCase();
                if (action==='congelar') {
                    const res=findAlive(parts[1],player.name);
                    if (!res) { w(player.name,'⚠ Jugador no encontrado.'); return; }
                    if (!res.exact) { suggest(player.name,res.player.name,()=>processDayTurn(player,`congelar ${res.player.name}`)); return; }
                    rs.actions--; GAME.frozenPlayer=res.player.name;
                    pub(`✧ ¡El Psíquico ha congelado a ${res.player.name}! ❄ No podrá hablar, votar ni usar su habilidad.`);
                    w(res.player.name,'¡Estás siendo congelado por el Psíquico! ❄ No podrás hablar, votar ni usar tu habilidad.');
                    markAttended(turn.id);
                } else if (action==='exterminar') {
                    if (rs.extsUsed>=1) { w(player.name,'⚠ Solo puedes exterminar a 1 jugador por partida.'); return; }
                    const res=findAlive(parts[1],player.name);
                    if (!res) { w(player.name,'⚠ Jugador no encontrado.'); return; }
                    if (!res.exact) { suggest(player.name,res.player.name,()=>processDayTurn(player,`exterminar ${res.player.name}`)); return; }
                    rs.actions--; rs.extsUsed++;
                    if (res.player.role.team==='buenos') {
                        killPlayer(res.player.name,'psiquico'); killPlayer(player.name,'psiquico_backfire');
                        pub(`👽 ¡El Psíquico exterminó a ${res.player.name}... y murió junto a él por ser del equipo bueno!`);
                    } else { killPlayer(res.player.name,'psiquico'); pub(`El psíquico ha exterminado al jugador ${res.player.name} con sus poderes. 👽`); }
                    markAttended(turn.id); checkWinCondition();
                } else if (action==='controlar') {
                    const tP=findAlive(parts[1],player.name), vP=findAlive(parts[2],player.name);
                    if (!tP||!vP) { w(player.name,'⚠ Usa: "controlar Jugador ObjetivoVoto"'); return; }
                    rs.actions--; GAME.controlledVote={player:tP.player.name, voteFor:vP.player.name};
                    pub(`✧ El psíquico ha controlado a ${tP.player.name} para votar por ${vP.player.name}. ✔`);
                    w(tP.player.name,'¡Estás siendo controlado por el Psíquico! Deberás votar por quien indique. ❌');
                    markAttended(turn.id);
                } else { w(player.name,'⚠ Usa: "congelar Jugador", "exterminar Jugador" o "controlar Jugador ObjetivoVoto"'); }
                break;
            }
            case 'Jorguín': {
                if (rs.hexesLeft<=0) { w(player.name,'⚠ Ya no tienes hechizos disponibles.'); markAttended(turn.id); return; }
                const roleMatch=ROLES_DEF.find(r=>norm(r.name)===norm(text));
                if (!roleMatch) { w(player.name,`⚠ No encontré el rol "${text}". Escribe el nombre exacto del rol.`); return; }
                if (rs.lastHexed===roleMatch.name) { w(player.name,'⚠ No puedes hechizar al mismo rol dos veces seguidas.'); return; }
                rs.hexesLeft--; rs.lastHexed=roleMatch.name; GAME.hexedRole=roleMatch.name;
                pub(`¡El ${roleMatch.name} está paralizado por el Jorguín! ⚡ No podrá usar su habilidad esta vez.`);
                const victim=alive().find(p=>p.role.name===roleMatch.name);
                if (victim) w(victim.name,'¡Has sido hechizado por el Jorguín! 🖤 No podrás usar tu habilidad en esta fase.');
                markAttended(turn.id); break;
            }
        }
    }

    /* ─── TURNOS DE VOTACIÓN ────────────────────────────────── */
    function processVotingTurn(player, text) {
        const role=player.role.name, rs=GAME.roleState[player.name], textL=text.toLowerCase().trim();
        const turn=GAME.pendingTurns.find(t=>t.playerName===player.name&&!t.responded);
        if (!turn) return;
        const isPreVotingTurn = turn.id.includes('_pre_v');
        const abilityCheck = canUseAbility(player);
        if (!abilityCheck.ok) { w(player.name, abilityCheck.reason); markAttended(turn.id); return; }

        switch(role) {
            case 'Secuaz': {
                if (rs.used) { w(player.name,'El Secuaz ya ha cancelado 1 ejecución. ¡Ya no podrá cancelar otra! ❌'); markAttended(turn.id); return; }
                if (textL==='si'||textL==='sí') {
                    const tp=getP(GAME.mostVoted);
                    if (!tp||(tp.role.team!=='malos'&&tp.name!==player.name)) { w(player.name,'⚠ Solo puedes salvar a un malvado o a ti mismo.'); markAttended(turn.id); return; }
                    rs.used=true; GAME.secuazBonusKill=true;
                    pub(`✧ ¡El Secuaz ha cancelado la ejecución de ${GAME.mostVoted}! 🗡️`);
                    GAME.mostVoted=null;
                    w(player.name,'✧ ¡Has salvado al jugador! Ahora escribe el nombre de un jugador adicional a eliminar ...');
                    markAttended(turn.id);
                } else markAttended(turn.id);
                break;
            }
            case 'Juez': {
                if (isPreVotingTurn) {
                    if (textL==='revelar') {
                        rs.revealed=true;
                        pub(`✧ ¡${player.name} ha revelado ser Juez(a)! Su voto contará doble.`);
                    }
                    markAttended(turn.id);
                    return;
                }
                if (rs.cancelUsed) { w(player.name,'El Juez(a) ya usó su cancelación de ejecución. ❌'); markAttended(turn.id); return; }
                if (textL==='cancelar') {
                    rs.cancelUsed=true;
                    const savedRole=getP(GAME.mostVoted)?.role;
                    pub(`✧ ¡El Juez(a) ha cancelado la ejecución de ${GAME.mostVoted}! 🏳️`);
                    if (savedRole) w(player.name,`✧ Has salvado a ${GAME.mostVoted}. Su rol: ${savedRole.emoji} ${savedRole.name}`);
                    GAME.mostVoted=null; markAttended(turn.id);
                } else markAttended(turn.id);
                break;
            }
            case 'Espectro': {
                if (!isPreVotingTurn) { markAttended(turn.id); return; }
                if (rs.used) { w(player.name,'⚠ Ya has usado tu habilidad esta partida.'); markAttended(turn.id); return; }
                if (textL==='provocar') {
                    if (!dead().length) { w(player.name,'¡No hay ningún jugador muerto! ❌'); return; }
                    rs.used=true;
                    GAME.ghostVotingEnabled = true;
                    pub('✧ ¡El Espectro ha provocado un fenómeno! Los fantasmas se levantan y solo por hoy los muertos podrán votar. ❕');
                    markAttended(turn.id);
                } else markAttended(turn.id);
                break;
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════
       COMANDOS PÚBLICOS
       ═══════════════════════════════════════════════════════════ */
    function cmdYo(playerName) {
        const p=getP(playerName);
        if (!p) { pub(`${playerName}: No estás en ninguna partida activa.`); return; }
        const st=p.status==='alive'?(p.tired?'💤':'💗'):'🪦';
        const roleStr=(p.status==='dead'||p.roleRevealed)&&p.role?`${p.role.emoji} ${p.role.name}`:'?';
        pub(`【${playerName}】 Estado: ${st} || Rol: ${roleStr}`);
    }

    function cmdSkip(playerName) {
        if (GAME.phase==='day') {
            if (GAME.frozenPlayer===playerName) return;
            GAME.skipVotes.add(playerName);
            const needed=Math.ceil(alive().length/2);
            if (GAME.skipVotes.size>=needed) {
                pub(`✧ La mayoría votó saltar la fase de discusión. (${GAME.skipVotes.size}/${alive().length})`);
                finishDayPhase();
            }
            return;
        }
        if (GAME.phase==='voting') registerVote(playerName, 'skip');
    }

    function cmdEnergy(adminName, targetName) {
        requireAdmin(adminName, () => {
            const p=getP(targetName);
            if (!p) { pub(`⚠ No encontré al jugador "${targetName}".`); return; }
            p.tired=false;
            pub(`✔ El estado de cansancio de ${targetName} ha sido removido.`);
            schedulePartyDescriptionUpdate();
        });
    }

    function cmdVotar(playerName, targetRaw) {
        if (GAME.phase!=='voting') return;
        const tl = (targetRaw||'').trim().toLowerCase();
        if (tl==='skip' || tl==='pasar') { w(playerName,'Usa !skip para votar SKIP.'); return; }
        const res=findAlive(targetRaw, playerName);
        if (!res) { w(playerName,'⚠ Jugador no encontrado para votar.'); return; }
        if (!res.exact) { suggest(playerName, res.player.name, ()=>cmdVotar(playerName, res.player.name)); return; }
        registerVote(playerName, res.player.name);
        w(playerName,`✔ Has votado por ${res.player.name}.`);
    }

    /* ═══════════════════════════════════════════════════════════
       CUENTAS MITM
       ═══════════════════════════════════════════════════════════ */
    function cmdSignup(senderName, username, password) {
        if (!username||!password) { pub('⚠ Uso: !signup [username] [contraseña]'); return; }
        if (!isValidName(username)) { pub('⚠ El username solo puede contener letras, números, _ - y .'); return; }
        const accs=loadAccounts();
        if (accs[username]) { pub(`⚠ Ya existe una cuenta con el username "${username}".`); return; }
        accs[username]={password, wins:0, losses:0, draws:0, seasonPoints:0, createdAt:Date.now()};
        saveAccounts(accs);
        pub(`¡Se ha creado la cuenta ${username}! ✧ Usa !login + la contraseña elegida (ej: !login 123) para iniciar sesión.`);
        pause(700);
        pub('Asegúrate de que el nombre de tu pony sea idéntico al username elegido. De lo contrario, no podrás gestionar tu cuenta.');
    }

    function cmdLogin(playerName, password) {
        if (!password) { w(playerName,'⚠ Uso: !login [contraseña]'); return; }
        const accs=loadAccounts(), acc=accs[playerName];
        if (!acc)                   { w(playerName,`⚠ No existe una cuenta con el nombre "${playerName}". Usa !signup primero.`); return; }
        if (acc.password!==password){ w(playerName,'⚠ Contraseña incorrecta.'); return; }
        const sess=loadSessions(); sess[playerName]=playerName; saveSessions(sess);
        const p=getP(playerName); if (p) p.mitmUser=playerName;
        w(playerName,`✔ ¡Has iniciado sesión como ${playerName}! ✧`);
    }

    function cmdLogout(playerName) {
        const sess=loadSessions();
        if (!sess[playerName]) { w(playerName,'⚠ No tienes una sesión activa.'); return; }
        delete sess[playerName]; saveSessions(sess);
        const p=getP(playerName); if (p) p.mitmUser=null;
        w(playerName,'✔ Has cerrado sesión. ✧');
    }

    function cmdDelacc(senderName, username, password) {
        if (!username||!password) { w(senderName,'⚠ Uso: !delacc [username] [contraseña]'); return; }
        const accs=loadAccounts(), acc=accs[username];
        if (!acc)                    { w(senderName,`⚠ No existe una cuenta "${username}".`); return; }
        if (acc.password!==password) { w(senderName,'⚠ Contraseña incorrecta.'); return; }
        delete accs[username]; saveAccounts(accs);
        const sess=loadSessions(); delete sess[username]; saveSessions(sess);
        w(senderName,`✔ La cuenta "${username}" ha sido eliminada.`);
    }

    function isAdmin(name) {
        return GAME.admins.has(name) || name === '__host__';
    }

    function requireAdmin(name, fn) {
        if (!isAdmin(name)) { pub(`⚠ Solo un admin puede usar ese comando.`); return; }
        fn();
    }

    function cmdAdminAssign(senderName, targetName) {
        requireAdmin(senderName, () => {
            if (!targetName) { pub('⚠ Uso: !admin [nombre]'); return; }
            GAME.admins.add(targetName);
            pub(`✔ ${targetName} ahora es admin de la partida. ✧`);
        });
    }

    function cmdVivos() {
        const alv = alive();
        if (!alv.length) { pub('No hay jugadores vivos.'); return; }
        pub(`💗 Jugadores vivos (${alv.length}): ${alv.map(p=>p.name).join(', ')}`);
    }

    function cmdMuertos() {
        const dl = dead();
        if (!dl.length) { pub('No hay jugadores muertos.'); return; }
        pub(`🪦 Jugadores muertos (${dl.length}): ${dl.map(p=>`${p.name} (${p.role?.emoji}${p.role?.name||'?'})`).join(', ')}`);
    }

    function cmdVer(targetName) {
        const res = findPlayer(targetName, GAME.players);
        if (!res) { pub(`⚠ No encontré al jugador "${targetName}".`); return; }
        const p = res.player;
        const st = p.status==='alive' ? (p.tired?'💤':'💗') : '🪦';
        const roleStr = (p.status==='dead'||p.roleRevealed) && p.role ? `${p.role.emoji} ${p.role.name}` : '?';
        pub(`【${p.name}】 Estado: ${st} || Rol: ${roleStr}`);
    }

    function cmdDar(adminName, itemNum, targetName) {
        requireAdmin(adminName, () => {
            if (!itemNum || !targetName) { pub('⚠ Uso: !dar [número] [jugador]'); return; }
            const res = findPlayer(targetName, GAME.players);
            if (!res) { pub(`⚠ No encontré al jugador "${targetName}".`); return; }
            const def = giveItem(res.player.name, itemNum);
            if (!def) { pub(`⚠ Número de ítem inválido. Usa del 1 al 15.`); return; }
            w(adminName, `✔ ${def.emoji} ${def.name} entregado a ${res.player.name}.`);
            w(res.player.name, `✧ ¡Has recibido un ítem: ${def.emoji} ${def.name}! ${def.desc}`);
            w(res.player.name, `► Para usarlo escribe por Whisper: !usar ${itemNum}  (también puedes usar el nombre del ítem).`);
        });
    }

    function cmdTired(adminName, targetName) {
        requireAdmin(adminName, () => {
            const p = getP(targetName);
            if (!p) { pub(`⚠ No encontré al jugador "${targetName}".`); return; }
            p.tired = true;
            pub(`✔ ${targetName} ahora tiene el estado 💤 Cansado.`);
            schedulePartyDescriptionUpdate();
        });
    }

    function cmdEnergyAll(adminName) {
        requireAdmin(adminName, () => {
            let count = 0;
            GAME.players.forEach(p => { if(p.tired){ p.tired=false; count++; } });
            pub(`✔ ${count} jugador(es) recuperaron su energía. 💗`);
            schedulePartyDescriptionUpdate();
        });
    }

    function cmdExpandir() {
        if (GAME.phase!=='lobby') { pub('⚠ Solo puedes expandir durante el lobby.'); return; }
        if (GAME.players.length<MAX_PLAYERS) { pub(`⚠ El lobby aún no está lleno (${GAME.players.length}/18). !expandir solo funciona cuando está completo.`); return; }
        if (GAME.expanded) { pub('⚠ El lobby ya fue expandido.'); return; }
        GAME.expanded = true;
        pub('✧ ¡El lobby ha sido expandido! Ahora pueden unirse más jugadores como 🧑 Inocentes.');
        pause(500);
        pub('► Usa !jugar para unirte a la partida.');
    }

    function cmdRefreshDesc() {
        updatePartyDescription()
            .then(ok => pub(ok ? '✔ Descripción actualizada.' : '⚠ No pude actualizar la descripción ahora mismo.'))
            .catch(() => pub('⚠ Error al reconstruir la descripción.'));
    }

    function cmdKick(targetName) {
        if (!targetName) { pub('⚠ Uso: !kick [nombre del jugador]'); return; }
        const res = findPlayer(targetName, GAME.players);
        if (!res) { pub(`⚠ No encontré al jugador "${targetName}" en la partida.`); return; }
        const p = res.player;
        if (GAME.phase==='lobby') {
            GAME.players = GAME.players.filter(pl => pl.name !== p.name);
            pub(`✔ ${p.name} ha sido eliminado del lobby.`);
            schedulePartyDescriptionUpdate();
        } else {
            if (p.status==='dead') { pub(`⚠ ${p.name} ya está muerto.`); return; }
            killPlayer(p.name, 'kick');
            p.roleRevealed = true;
            pub(`🚫 ${p.name} ha sido expulsado. Era: ${p.role?.emoji||''} ${p.role?.name||'?'}`);
            schedulePartyDescriptionUpdate();
            checkWinCondition();
        }
    }

    function cmdData(playerName) {
        const sess=loadSessions();
        if (!sess[playerName]) { w(playerName,'⚠ Debes iniciar sesión primero con !login.'); return; }
        const acc=loadAccounts()[playerName];
        if (!acc) { w(playerName,'⚠ No encontré tu cuenta.'); return; }
        pub(`【 ${playerName} 】 🎉: ${acc.wins} || 🪦: ${acc.losses} || 🏳: ${acc.draws} 【 👑: ${acc.seasonPoints} 】`);
    }


    /* ═══════════════════════════════════════════════════════════
       SISTEMA DE ÍTEMS
       ═══════════════════════════════════════════════════════════ */
    const ITEMS_DEF = {
        '1':  { id:'poster',        name:'Poster',            emoji:'📰', price:1,  desc:'Anuncia un mensaje anónimo al público.' },
        '2':  { id:'pocima',        name:'Pócima de Sanación',emoji:'🧪', price:1,  desc:'Regálasela a otro jugador; si fue atacado esa noche, sobrevivirá. Expira en 1 día. Cuesta ⚪3 si quedan <4 jugadores.' },
        '3':  { id:'rosas',         name:'Cesta de Rosas',    emoji:'🌹', price:1,  desc:'Regala rosas a otro jugador; obtiene ⚪1 extra.' },
        '4':  { id:'esfera',        name:'Esfera de Cristal', emoji:'🔮', price:1,  desc:'Revela quién será atacado esta noche. Cuesta ⚪3 si eres un rol protector.' },
        '5':  { id:'bisturi',       name:'Bisturí',           emoji:'🔬', price:2,  desc:'Analiza un cadáver y muestra 2 sospechosos posibles.' },
        '6':  { id:'megafono',      name:'Megáfono',          emoji:'📢', price:2,  desc:'Al morir, revela el rol de un jugador de tu elección.' },
        '7':  { id:'espejo',        name:'Espejo Místico',    emoji:'🪞', price:2,  desc:'Refleja habilidades usadas contra ti de vuelta al emisor. Expira en 1 día. No incluye ataques.' },
        '8':  { id:'botiquin',      name:'Botiquín',          emoji:'🩹', price:3,  desc:'Si eres atacado, te mantiene con vida un día más.' },
        '9':  { id:'manoplas',      name:'Manoplas',          emoji:'🥊', price:3,  desc:'Tu voto vale +1 en la fase de votación. Expira en 1 día.' },
        '10': { id:'bomba_humo',    name:'Bomba de Humo',     emoji:'💨', price:3,  desc:'Si estás por ser ejecutado, te salvas automáticamente.' },
        '11': { id:'binoculares',   name:'Binoculares',       emoji:'🔭', price:4,  desc:'Observa a un jugador y descubre su rol.' },
        '12': { id:'reloj',         name:'Reloj de Arena',    emoji:'⏳', price:4,  desc:'Anula la votación actual y se repite. Los que votaron deben votar a otro; los que votaron skip no pueden volver a votar.' },
        '13': { id:'daga',          name:'Daga',              emoji:'🗡', price:4,  desc:'Al morir, eliminas a otro jugador contigo.' },
        '14': { id:'disfraz',       name:'Disfraz',           emoji:'🎭', price:5,  desc:'Asumes el rol de otro jugador por un día (único).' },
        '15': { id:'amuleto',       name:'Amuleto Embrujado', emoji:'📿', price:6,  desc:'Al morir, regresas a la vida como Inocente automáticamente.' },
    };

    const PROTECTOR_ROLES = ['Médico','Guardaespaldas','Justiciero'];

    function giveItem(playerName, itemNum) {
        const def = ITEMS_DEF[String(itemNum)];
        if (!def) return false;
        if (!GAME.items[playerName]) GAME.items[playerName] = [];
        GAME.items[playerName].push({ ...def, active: ['manoplas','espejo','pocima'].includes(def.id) });
        return def;
    }

    function useItem(player, itemId, targetName) {
        if (hasActiveTurn(player.name)) {
            w(player.name, '⚠ No puedes usar objetos mientras tu turno está corriendo. Úsalos fuera de tu turno.');
            return;
        }
        const inv = GAME.items[player.name] || [];
        const item = inv.find(it => it.id === itemId);
        if (!item) { w(player.name, '⚠ No tienes ese ítem.'); return; }

        switch(itemId) {
            case 'poster': {
                w(player.name, '📰 Escribe el mensaje que quieres anunciar anónimamente (por Whisper):');
                GAME.pendingConfs[player.name] = { poster: true, expiresAt: Date.now() + 30_000 };
                setTimeout(() => {
                    if (GAME.pendingConfs[player.name]?.poster && GAME.pendingConfs[player.name]?.expiresAt <= Date.now()) {
                        delete GAME.pendingConfs[player.name];
                        w(player.name, '⏰ Se agotó el tiempo para usar ese objeto (30s).');
                    }
                }, 30_000);
                break;
            }
            case 'pocima': {
                w(player.name, '🧪 ¿A qué jugador le regalas la Pócima de Sanación? Escribe su nombre:');
                GAME.pendingConfs[player.name] = { pocima: true, itemRef: item, expiresAt: Date.now() + 30_000 };
                setTimeout(() => {
                    if (GAME.pendingConfs[player.name]?.pocima && GAME.pendingConfs[player.name]?.expiresAt <= Date.now()) {
                        delete GAME.pendingConfs[player.name];
                        w(player.name, '⏰ Se agotó el tiempo para elegir jugador (30s).');
                    }
                }, 30_000);
                break;
            }
            case 'rosas': {
                w(player.name, '🌹 ¿A qué jugador le regalas la Cesta de Rosas? Escribe su nombre:');
                GAME.pendingConfs[player.name] = { rosas: true, itemRef: item, expiresAt: Date.now() + 30_000 };
                setTimeout(() => {
                    if (GAME.pendingConfs[player.name]?.rosas && GAME.pendingConfs[player.name]?.expiresAt <= Date.now()) {
                        delete GAME.pendingConfs[player.name];
                        w(player.name, '⏰ Se agotó el tiempo para elegir jugador (30s).');
                    }
                }, 30_000);
                break;
            }
            case 'esfera': {
                const alv = alive();
                const isProtector = PROTECTOR_ROLES.includes(player.role.name);
                const price = (alv.length < 4 || isProtector) ? 3 : 1;
                const evilVoteTarget = Object.values(GAME.evilVotes)[0] || 'desconocido';
                GAME.items[player.name] = inv.filter(it => it !== item);
                w(player.name, `🔮 La Esfera revela: El equipo malvado tiene sus ojos puestos en... ${evilVoteTarget}`);
                break;
            }
            case 'bisturi': {
                const deadList = dead();
                if (!deadList.length) { w(player.name, '⚠ No hay cadáveres que analizar.'); return; }
                GAME.items[player.name] = inv.filter(it => it !== item);
                const suspects = alive().filter(p=>p.role.team==='malos').slice(0,2).map(p=>p.name);
                const suspStr = suspects.length ? suspects.join(' y ') : 'nadie identificado';
                w(player.name, `🔬 El análisis del cadáver señala posibles sospechosos: ${suspStr}`);
                break;
            }
            case 'binoculares': {
                w(player.name, '🔭 ¿A qué jugador observas con los binoculares? Escribe su nombre:');
                GAME.pendingConfs[player.name] = { binoculares: true, itemRef: item, expiresAt: Date.now() + 30_000 };
                setTimeout(() => {
                    if (GAME.pendingConfs[player.name]?.binoculares && GAME.pendingConfs[player.name]?.expiresAt <= Date.now()) {
                        delete GAME.pendingConfs[player.name];
                        w(player.name, '⏰ Se agotó el tiempo para elegir jugador (30s).');
                    }
                }, 30_000);
                break;
            }
            case 'reloj': {
                if (GAME.phase !== 'voting') { w(player.name, '⚠ Solo puedes usar el Reloj durante la votación.'); return; }
                GAME.items[player.name] = inv.filter(it => it !== item);
                const prevVoters = { ...GAME.votesMade };
                const prevSkips = new Set(GAME.skipVotes);
                GAME.voteTally = {}; GAME.votesMade = {}; GAME.skipVotes = new Set();
                pub('⏳ ¡El Reloj de Arena ha anulado la votación! Se vuelve a votar. Quienes votaron deben elegir a otro jugador.');
                // Marcar bloqueados para esta ronda
                GAME.relojBlocked = new Set([...Object.keys(prevVoters), ...Array.from(prevSkips)]);
                break;
            }
            case 'disfraz': {
                w(player.name, '🎭 ¿El rol de qué jugador deseas asumir hoy? Escribe su nombre:');
                GAME.pendingConfs[player.name] = { disfraz: true, itemRef: item, expiresAt: Date.now() + 30_000 };
                setTimeout(() => {
                    if (GAME.pendingConfs[player.name]?.disfraz && GAME.pendingConfs[player.name]?.expiresAt <= Date.now()) {
                        delete GAME.pendingConfs[player.name];
                        w(player.name, '⏰ Se agotó el tiempo para elegir jugador (30s).');
                    }
                }, 30_000);
                break;
            }
            default: {
                w(player.name, `⚠ Ese ítem no puede usarse con este comando. Es de efecto automático.`);
            }
        }
    }

    function resolveItemId(rawArg) {
        const arg = String(rawArg || '').trim();
        if (!arg) return null;
        if (ITEMS_DEF[arg]) return ITEMS_DEF[arg].id;
        const n = norm(arg);
        const byName = Object.values(ITEMS_DEF).find(it => norm(it.name) === n || norm(it.id) === n);
        return byName ? byName.id : null;
    }

    // Manejo de ítems en onWhisper (POSTER, PÓCIMA, ROSAS, BINOCULARES, DISFRAZ)
    function handleItemConf(senderName, text, conf) {
        const player = getP(senderName);

        if (conf.poster) {
            delete GAME.pendingConfs[senderName];
            pub(`📰 Anuncio anónimo: "${text}"`);
            return true;
        }
        if (conf.pocima) {
            const res = findAlive(text, senderName);
            if (!res) { w(senderName,'⚠ Jugador no encontrado. Escribe el nombre del destinatario:'); return true; }
            if (!res.exact) { suggest(senderName, res.player.name, ()=>onWhisper(senderName, res.player.name)); return true; }
            delete GAME.pendingConfs[senderName];
            GAME.items[senderName] = (GAME.items[senderName]||[]).filter(it=>it!==conf.itemRef);
            if (!GAME.items[res.player.name]) GAME.items[res.player.name] = [];
            GAME.items[res.player.name].push({ id:'pocima_activa', name:'Pócima de Sanación', emoji:'🧪', active:true });
            w(senderName, `✔ Le has regalado la Pócima a ${res.player.name}. Si es atacado esta noche, sobrevivirá.`);
            w(res.player.name, '🧪 ¡Has recibido una Pócima de Sanación! Si eres atacado esta noche, sobrevivirás.');
            return true;
        }
        if (conf.rosas) {
            const res = findAlive(text, senderName);
            if (!res) { w(senderName,'⚠ Jugador no encontrado.'); return true; }
            if (!res.exact) { suggest(senderName, res.player.name, ()=>onWhisper(senderName, res.player.name)); return true; }
            delete GAME.pendingConfs[senderName];
            GAME.items[senderName] = (GAME.items[senderName]||[]).filter(it=>it!==conf.itemRef);
            // Dar 1 perla al destinatario via Sellerhoove
            w('Sellerhoove ⚙', `!p 1 ${res.player.name}`);
            w(senderName, `✔ Le has regalado la Cesta de Rosas a ${res.player.name}. Obtendrá ⚪1.`);
            w(res.player.name, `🌹 ¡${senderName} te ha regalado una Cesta de Rosas! Has obtenido ⚪1.`);
            return true;
        }
        if (conf.binoculares) {
            const res = findPlayer(text, GAME.players);
            if (!res) { w(senderName,'⚠ Jugador no encontrado.'); return true; }
            if (!res.exact) { suggest(senderName, res.player.name, ()=>onWhisper(senderName, res.player.name)); return true; }
            delete GAME.pendingConfs[senderName];
            if (player) GAME.items[senderName] = (GAME.items[senderName]||[]).filter(it=>it!==conf.itemRef);
            w(senderName, `🔭 Los binoculares revelan: ${res.player.name} es ${res.player.role?.emoji} ${res.player.role?.name}.`);
            return true;
        }
        if (conf.disfraz) {
            const res = findAlive(text, senderName);
            if (!res) { w(senderName,'⚠ Jugador no encontrado.'); return true; }
            if (!res.exact) { suggest(senderName, res.player.name, ()=>onWhisper(senderName, res.player.name)); return true; }
            delete GAME.pendingConfs[senderName];
            if (player) GAME.items[senderName] = (GAME.items[senderName]||[]).filter(it=>it!==conf.itemRef);
            const origRole = player?.role;
            if (player) { player.role = res.player.role; GAME.roleState[senderName] = initRoleState(res.player.role.name); }
            w(senderName, `🎭 ¡Ahora aparentas ser ${res.player.role?.emoji} ${res.player.role?.name} por hoy!`);
            // Revertir al día siguiente (al iniciar siguiente noche)
            GAME.disguiseRevert = { playerName: senderName, origRole };
            return true;
        }
        return false;
    }

    /* ═══════════════════════════════════════════════════════════
       OBSERVADORES DE CHAT
       ═══════════════════════════════════════════════════════════ */
    function watchPublicChat() {
        const log=document.querySelector('.chat-log');
        if (!log) return setTimeout(watchPublicChat, 500);
        new MutationObserver(muts => {
            muts.forEach(mu => mu.addedNodes.forEach(node => {
                if (node.nodeType!==1||!node.classList.contains('chat-line')||node.classList.contains('chat-line-whisper')) return;
                const nameEl=node.querySelector('.chat-line-name-content');
                const msgEl =node.querySelector('.chat-line-message');
                if (!nameEl||!msgEl) return;
                const playerName=extractText(nameEl), rawMsg=extractText(msgEl), msgL=rawMsg.toLowerCase().trim();
                const parts = rawMsg.trim().split(/\s+/);
                if (msgL==='!crear')    { cmdCrear(playerName); return; }
                if (msgL==='!jugar')    { cmdJugar(playerName); return; }
                if (msgL==='!comenzar') { requireAdmin(playerName, cmdComenzar); return; }
                if (msgL==='!yo')       { cmdYo(playerName); return; }
                if (msgL==='!skip')     { cmdSkip(playerName); return; }
                if (msgL==='!data')     { cmdData(playerName); return; }
                if (msgL==='!vivos')    { cmdVivos(); return; }
                if (msgL==='!muertos')  { cmdMuertos(); return; }
                if (msgL==='!energyall'||msgL==='!ea') { cmdEnergyAll(playerName); return; }
                if (msgL==='!reset')    { requireAdmin(playerName, ()=>{ clearAllTimers(); GAME=mkGame(); pub('✔ Partida reiniciada.'); }); return; }
                if (msgL==='!expandir') { cmdExpandir(); return; }
                if (msgL==='!refreshdesc') { cmdRefreshDesc(); return; }
                if (msgL.startsWith('!kick ')    ||msgL.startsWith('!eliminar ')) { requireAdmin(playerName,()=>cmdKick(parts.slice(1).join(' '))); return; }
                if (msgL.startsWith('!admin '))  { cmdAdminAssign(playerName, parts.slice(1).join(' ')); return; }
                if (msgL.startsWith('!ver '))    { cmdVer(parts.slice(1).join(' ')); return; }
                if (msgL.startsWith('!dar '))    { requireAdmin(playerName,()=>cmdDar(playerName, parts[1], parts.slice(2).join(' '))); return; }
                if (msgL.startsWith('!tired ')||msgL.startsWith('!t ')) { requireAdmin(playerName,()=>cmdTired(playerName,parts.slice(1).join(' '))); return; }
                if (msgL.startsWith('!energy ')) { requireAdmin(playerName,()=>cmdEnergy(playerName, parts.slice(1).join(' '))); return; }
                if (msgL.startsWith('!signup ')) { const p=rawMsg.split(/\s+/); cmdSignup(playerName,p[1],p[2]); return; }
                if (msgL.startsWith('!delacc ')) { const p=rawMsg.split(/\s+/); cmdDelacc(playerName,p[1],p[2]); return; }
                if (msgL.startsWith('!votar ')||msgL.startsWith('!v ')) { cmdVotar(playerName, parts.slice(1).join(' ')); return; }
                if (msgL.startsWith('!usar ')) {
                    const p = getP(playerName);
                    const arg = parts.slice(1).join(' ');
                    const itemId = resolveItemId(arg);
                    if (!p) return;
                    if (!itemId) { w(playerName,'⚠ Ítem no reconocido. Usa !usar [número o nombre].'); return; }
                    useItem(p, itemId, '');
                    return;
                }
            }));
        }).observe(log, { childList:true, subtree:true });
    }

    // Prefijos de mensajes enviados por el bot — ignorar si aparecen en el observer
    const BOT_PREFIXES = ['✧','✔','⚠','【','❌','💔','🎉','☠','🛡','👤','🔔','🌕','⚖','🍅','🎃','🔥','💥','👽','❤','⚔','🗡','🔪','💘','❄','🌙','☀'];

    function watchWhispers() {
        const log=document.querySelector('.chat-log');
        if (!log) return setTimeout(watchWhispers, 500);
        new MutationObserver(muts => {
            muts.forEach(mu => mu.addedNodes.forEach(node => {
                if (node.nodeType!==1||!node.classList.contains('chat-line-whisper')) return;
                const nameEl=node.querySelector('.chat-line-name-content');
                const msgEl =node.querySelector('.chat-line-message');
                if (!nameEl||!msgEl) return;

                const senderName = extractText(nameEl);
                const rawMsg     = extractText(msgEl);
                const msgL       = rawMsg.toLowerCase().trim();

                // ── FILTRO 1: ignorar mensajes enviados por el propio bot ──
                // Los whispers salientes aparecen en el log; se identifican porque
                // el nombre del remitente no está en GAME.players Y el mensaje
                // empieza con un prefijo de bot, o el remitente está vacío.
                if (!senderName) return;
                if (BOT_PREFIXES.some(p => rawMsg.startsWith(p))) return;

                // ── FILTRO 2: comandos de cuenta (cualquiera puede usarlos) ──
                if (msgL.startsWith('!login '))             { cmdLogin(senderName, rawMsg.split(/\s+/)[1]); return; }
                if (msgL.startsWith('!logout'))              { cmdLogout(senderName); return; }
                if (msgL==='!data')                          { cmdData(senderName); return; }
                if (msgL==='!sintareas'&&GAME.phase==='tasks') { finishTasksPhase(); return; }

                // ── FILTRO 3: solo jugadores activos de la partida pueden responder turnos ──
                const isGamePlayer = GAME.players.some(p => p.name === senderName);
                const hasPendingConf = !!GAME.pendingConfs[senderName];
                const isJusticiero = GAME.justicieroKill?.killer === senderName;
                const isSecuaz = GAME.secuazBonusKill && GAME.players.find(p=>p.role?.name==='Secuaz'&&p.name===senderName);

                if (!isGamePlayer && !hasPendingConf && !isJusticiero && !isSecuaz) return;

                onWhisper(senderName, rawMsg);
            }));
        }).observe(log, { childList:true, subtree:true });
    }

    /* ═══════════════════════════════════════════════════════════
       PANEL DE CONTROL UI
       ═══════════════════════════════════════════════════════════ */
    function createAutoPanel() {
        const existing=document.getElementById('mitm-auto-panel');
        if (existing) existing.remove();
        const panel=document.createElement('div');
        panel.id='mitm-auto-panel';
        Object.assign(panel.style, {
            position:'fixed', left:'16px', top:'60px', width:'240px',
            background:'linear-gradient(160deg,rgba(13,17,23,0.97),rgba(9,12,17,0.98))',
            border:'1px solid rgba(255,255,255,0.06)', color:'#e2e8f0', padding:'12px',
            borderRadius:'14px', boxShadow:'0 12px 40px rgba(0,0,0,0.7)', zIndex:'999997',
            display:'flex', flexDirection:'column', gap:'7px',
            fontFamily:'Inter,Segoe UI,system-ui,sans-serif', fontSize:'12px',
        });

        // Header
        const hdr=document.createElement('div');
        hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;cursor:grab;user-select:none;';
        const titleDiv=document.createElement('div');
        titleDiv.innerHTML='<div style="font-size:13px;font-weight:800;letter-spacing:-.3px;">🎮 MITM AUTO</div><div style="font-size:10px;color:#64748b;margin-top:1px;">Mystery in the Meeting</div>';
        const btnMin=document.createElement('button');
        btnMin.textContent='−';
        btnMin.style.cssText='background:rgba(255,255,255,0.06);color:#94a3b8;border:none;border-radius:6px;padding:3px 7px;cursor:pointer;font-size:14px;font-weight:900;';
        let collapsed=false;
        btnMin.onclick=()=>{ collapsed=!collapsed; body.style.display=collapsed?'none':'flex'; btnMin.textContent=collapsed?'+':'−'; };
        hdr.append(titleDiv, btnMin);

        // Body
        const body=document.createElement('div');
        body.style.cssText='display:flex;flex-direction:column;gap:6px;';

        const statusDiv=document.createElement('div');
        statusDiv.id='mitm-status';
        statusDiv.style.cssText='padding:7px 10px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:11px;color:#94a3b8;';
        statusDiv.textContent='⏸ Inactivo — usa !crear en el chat';

        const playersDiv=document.createElement('div');
        playersDiv.id='mitm-players';
        playersDiv.style.cssText='padding:7px 10px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);font-size:11px;color:#64748b;max-height:130px;overflow-y:auto;';
        playersDiv.textContent='— Sin jugadores —';

        const sep=document.createElement('div');
        sep.style.cssText='height:1px;background:rgba(255,255,255,0.06);';

        const mkBtn=(txt,bg,fg,fn)=>{
            const b=document.createElement('button');
            b.textContent=txt;
            b.style.cssText=`padding:6px 10px;border-radius:8px;border:none;cursor:pointer;font-weight:700;font-size:11px;background:${bg};color:${fg};transition:filter .15s;width:100%;text-align:left;`;
            b.onmouseenter=()=>b.style.filter='brightness(1.2)';
            b.onmouseleave=()=>b.style.filter='';
            b.onclick=fn; return b;
        };
        const btnCrear    =mkBtn('✧ Crear lobby',           'rgba(52,211,153,0.15)', '#34d399', ()=>cmdCrear('__host__'));
        const btnComenzar =mkBtn('▶ Comenzar partida',      'rgba(99,179,237,0.15)', '#93c5fd', ()=>cmdComenzar());
        const btnSkipNight=mkBtn('⏭ Forzar fin de noche',  'rgba(147,197,253,0.1)', '#93c5fd', ()=>{ if(GAME.phase==='night') finishNightPhase(); });
        const btnSkipDay  =mkBtn('⏭ Forzar fin de día',    'rgba(251,191,36,0.1)',  '#fbbf24', ()=>{ if(GAME.phase==='day') finishDayPhase(); });
        const btnSkipTask =mkBtn('⏭ Saltar tareas',        'rgba(167,139,250,0.1)', '#a78bfa', ()=>{ if(GAME.phase==='tasks') finishTasksPhase(); });
        const btnReset    =mkBtn('↺ Reiniciar partida',     'rgba(239,68,68,0.12)',  '#f87171', ()=>{ clearAllTimers(); GAME=mkGame(); pub('✔ Partida reiniciada.'); });

        const turnDiv=document.createElement('div');
        turnDiv.id='mitm-turns';
        turnDiv.style.cssText='font-size:11px;color:#64748b;padding:4px 8px;border-radius:7px;background:rgba(255,255,255,0.03);display:none;';

        body.append(statusDiv, playersDiv, sep, btnCrear, btnComenzar, btnSkipNight, btnSkipDay, btnSkipTask, btnReset, turnDiv);
        panel.append(hdr, body);
        document.body.appendChild(panel);

        // Arrastrar
        let drag=false, sx,sy,sl,st;
        hdr.addEventListener('mousedown', e=>{ drag=true; sx=e.clientX; sy=e.clientY; sl=panel.offsetLeft; st=panel.offsetTop; hdr.style.cursor='grabbing'; e.preventDefault(); });
        document.addEventListener('mouseup', ()=>{ drag=false; hdr.style.cursor='grab'; });
        document.addEventListener('mousemove', e=>{ if(!drag)return; panel.style.left=(sl+e.clientX-sx)+'px'; panel.style.top=(st+e.clientY-sy)+'px'; });

        setInterval(updatePanel, 1500);
    }

    function updatePanel() {
        const statusDiv=document.getElementById('mitm-status');
        const playersDiv=document.getElementById('mitm-players');
        const turnDiv=document.getElementById('mitm-turns');
        if (!statusDiv) return;
        const pn={idle:'⏸ Inactivo', lobby:'🟢 Lobby abierto', starting:'⏳ Iniciando...', night:`🌙 Noche N.º ${GAME.nightNum}`, day:`☀ Día N.º ${GAME.dayNum}`, voting:'🗞 Votación', tasks:'📚 Tareas'};
        statusDiv.textContent=`${pn[GAME.phase]||GAME.phase} — ${GAME.players.length} jugadores`;
        if (!GAME.players.length) { playersDiv.textContent='— Sin jugadores —'; }
        else {
            playersDiv.innerHTML='';
            GAME.players.forEach(p=>{
                const row=document.createElement('div');
                const st=p.status==='alive'?(p.tired?'💤':'💗'):'🪦';
                // El panel es del host: siempre muestra el rol completo
                const teamColor = p.role ? {buenos:'#34d399', malos:'#f87171', solo:'#a78bfa'}[p.role.team] || '#94a3b8' : '#64748b';
                const roleStr = p.role ? `${p.role.emoji} ${p.role.name}` : '—';
                row.style.cssText=`padding:2px 0;color:${p.status==='dead'?'#475569':'#cbd5e1'};display:flex;gap:5px;align-items:center;`;
                const nameSpan=document.createElement('span');
                nameSpan.textContent=`${st} ${p.name}`;
                nameSpan.style.cssText=`flex:1;${p.status==='dead'?'text-decoration:line-through;opacity:0.5;':''}`;
                const roleSpan=document.createElement('span');
                roleSpan.textContent=roleStr;
                roleSpan.style.cssText=`font-size:10px;font-weight:700;color:${teamColor};white-space:nowrap;`;
                row.append(nameSpan, roleSpan);
                playersDiv.appendChild(row);
            });
        }
        if (GAME.totalTurns>0&&GAME.phase!=='idle'&&GAME.phase!=='lobby') {
            turnDiv.style.display='block';
            turnDiv.textContent=`Turnos: ${GAME.turnsAttended}/${GAME.totalTurns} ✦`;
        } else turnDiv.style.display='none';
    }

    /* ═══════════════════════════════════════════════════════════
       ARRANQUE
       ═══════════════════════════════════════════════════════════ */
    function init() {
        createAutoPanel();
        watchPublicChat();
        watchWhispers();
        console.log('[MITM AUTO v1.0] Script cargado correctamente.');
    }

    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.MITMauto = { GAME, pub, w, killPlayer, checkWinCondition, startNightPhase, startDayPhase, startVotingPhase, startTasksPhase, finishNightPhase, finishDayPhase, finishTasksPhase };

})();
