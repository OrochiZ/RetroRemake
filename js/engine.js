"use strict";

const MASK_ATTACK = 1;
const MASK_JUMP   = 2;
const MASK_MAGIC  = 4;
const MASK_UP     = 8;
const MASK_DOWN   = 16;
const MASK_LEFT   = 32;
const MASK_RIGHT  = 64;
const MASK_MOUNT_MAGIC = 128; 

const rawKeys = { w:0, a:0, s:0, d:0, j:0, k:0, l:0, o:0, u:0, h:0 };
const keyMap = { 'w':'w', 'a':'a', 's':'s', 'd':'d', 'j':'j', 'k':'k', 'l':'l', 'o':'o', 'u':'u', 'h':'h' };

window.onkeydown = e => { let k = keyMap[e.key.toLowerCase()]; if (k) rawKeys[k] = 1; };
window.onkeyup = e => { let k = keyMap[e.key.toLowerCase()]; if (k) rawKeys[k] = 0; };

let inputManager = {
    keyState: [0, 0], 
    isDirectionHeld:[false, false, false, false], 
};

let prevRawKeys = { w:0, a:0, s:0, d:0, j:0, k:0, l:0, o:0, u:0, h:0 };
let turboCounter = 0;
let comboBuffered = false;
let turboMode = false;
let showHitboxes = false;

function pollInput() {
    if (rawKeys.u && !prevRawKeys.u) {
        turboMode = !turboMode;
        let el = document.getElementById('turbo-status');
        if (el) { el.textContent = turboMode ? "开" : "关"; el.style.color = turboMode ? "#4CAF50" : "#f44336"; }
    }
    if (rawKeys.h && !prevRawKeys.h) {
        showHitboxes = !showHitboxes;
        let el = document.getElementById('hitbox-status');
        if (el) { el.textContent = showHitboxes ? "开" : "关"; el.style.color = showHitboxes ? "#4CAF50" : "#f44336"; }
    }

    let currentMask = 0;
    if (rawKeys.j) currentMask |= MASK_ATTACK;
    if (rawKeys.k) currentMask |= MASK_JUMP;
    if (rawKeys.l) currentMask |= MASK_MAGIC;
    if (rawKeys.o) currentMask |= MASK_MOUNT_MAGIC; 
    if (rawKeys.w) currentMask |= MASK_UP;
    if (rawKeys.s) currentMask |= MASK_DOWN;
    if (rawKeys.a) currentMask |= MASK_LEFT;
    if (rawKeys.d) currentMask |= MASK_RIGHT;

    let prevMask = 0;
    if (prevRawKeys.j) prevMask |= MASK_ATTACK;
    if (prevRawKeys.k) prevMask |= MASK_JUMP;
    if (prevRawKeys.l) prevMask |= MASK_MAGIC;
    if (prevRawKeys.o) prevMask |= MASK_MOUNT_MAGIC;
    if (prevRawKeys.w) prevMask |= MASK_UP;
    if (prevRawKeys.s) prevMask |= MASK_DOWN;
    if (prevRawKeys.a) prevMask |= MASK_LEFT;
    if (prevRawKeys.d) prevMask |= MASK_RIGHT;

    let justPressed = currentMask & ~prevMask;
    
    // 【核心修复1：精准区分连发开启/关闭时的底层流控】
    if (turboMode) {
        turboCounter++;
        let pulse = (turboCounter % 4) < 2;
        let actionMasks = MASK_ATTACK | MASK_JUMP | MASK_MAGIC | MASK_MOUNT_MAGIC;
        // 开启连发：如果按住动作键，每隔两帧制造一个人工的 JustPressed 脉冲
        inputManager.keyState[1] = justPressed | (pulse ? (currentMask & actionMasks) : 0);
        // Held 状态始终保持真实物理按压
        inputManager.keyState[0] = currentMask; 
    } else {
        inputManager.keyState[1] = justPressed;
        let actionMasks = MASK_ATTACK | MASK_JUMP | MASK_MAGIC | MASK_MOUNT_MAGIC;
        // 关闭连发：将动作键的 Held 状态暴力降级为 JustPressed 状态，
        // 这意味着按住不放时，只有按下去的第一帧才被视为有效输入！
        inputManager.keyState[0] = (currentMask & ~actionMasks) | (justPressed & actionMasks);
    }

    inputManager.isDirectionHeld[0] = (currentMask & MASK_LEFT) !== 0;
    inputManager.isDirectionHeld[1] = (currentMask & MASK_UP) !== 0;
    inputManager.isDirectionHeld[2] = (currentMask & MASK_RIGHT) !== 0;
    inputManager.isDirectionHeld[3] = (currentMask & MASK_DOWN) !== 0;

    if (inputManager.keyState[1] & MASK_ATTACK) comboBuffered = true;

    for (let k in rawKeys) prevRawKeys[k] = rawKeys[k];
}

function isActionHeld(mask) { return (inputManager.keyState[0] & mask) !== 0; }
function isActionPressed(mask) { return (inputManager.keyState[1] & mask) !== 0; }

class Entity {
    constructor(charId, type, x, y) {
        this.charId = charId; this.type = type; 
        this.x = x; this.y = y; this.z = 0;
        this.vx = 0; this.vy = 0; this.vz = 0; this.az = 0;
        this.dir = 1; this.offsetY = 0; 
        this.animSeq = 0; this.animIdx = 0;
        this.frameId = 0; this.delay = 0; this.short1Offset = 0; 
        
        this.hp = 100; this.maxHp = 100;
        this.hitActive = false; 
        this.hitEntities =[]; 
        
        this.state = 0; this.stateTimer = 0; this.stunAccum = 0; 
        this.invincibilityTimer = 0; this.hitstunTimer = 0;
        this.hitDamage = 3; this.attackPower = 8;
        this.lastAttackAnimId = 0; this.flags = 1;
    }
    setAnim(seq) {
        this.animSeq = seq; this.animIdx = 0; this.delay = 0;
        this.hitActive = false; this.short1Offset = 0;
        this.hitEntities =[];
    }
}

function advanceAnim(ent) {
    if (ent.delay > 0) { ent.delay--; return; }
    let loops = 20; 
    while (loops-- > 0) {
        let seq = motionData[ent.charId] ? motionData[ent.charId][ent.animSeq] : null;
        if (!seq) { ent.delay = -1; return; }
        
        let op = seq[ent.animIdx++];
        if (op === undefined) { ent.delay = -1; return; }

        if (op < 4096) {
            ent.frameId = op + ent.short1Offset; 
            ent.delay = seq[ent.animIdx++];
            ent.hitActive = true; 
            ent.hitEntities =[]; 
            return;
        }

        switch (op) {
            case 4096: ent.animIdx = seq[ent.animIdx] * 2; break; 
            case 4097: ent.animSeq = seq[ent.animIdx]; ent.animIdx = 0; ent.short1Offset = 0; break; 
            case 4098: ent.animIdx--; ent.delay = -1; return; 
            case 4099: ent.frameId = -1; ent.delay = seq[ent.animIdx++]; return; 
            case 4101: ent.x += seq[ent.animIdx++] * ent.dir; break;
            case 4103: ent.z = seq[ent.animIdx++]; break; 
            case 4104: ent.dir = -ent.dir; break; 
            case 4105: ent.animIdx++; break;
            case 4106: ent.short1Offset = seq[ent.animIdx++]; break; 
            case 4107: ent.y += seq[ent.animIdx++]; break;
            case 4109: ent.animIdx++; break;
            case 4110: break;
            case 4111: ent.hitDamage = seq[ent.animIdx++]; break; 
            case 4112: ent.hitstunTimer = seq[ent.animIdx++]; break; 
            case 4113: ent.attackPower = seq[ent.animIdx++]; break; 
            default:
                ent.frameId = op + ent.short1Offset;
                ent.delay = seq[ent.animIdx++];
                ent.hitActive = true;
                ent.hitEntities =[]; 
                return; 
        }
    }
}

function getHitDataEntry(frameId, charId) {
    if (frameId < 0) return null;
    if (frameId < 512) return hitData[charId < 5 ? charId : mainPlayer] ? hitData[charId < 5 ? charId : mainPlayer][frameId] : null;
    if (frameId >= 512 && frameId < 1024) return hitData[5] ? hitData[5][frameId & 511] : null; 
    if (frameId >= 1536 && frameId < 2048) return hitData[7] ? hitData[7][frameId & 511] : null; 
    return null;
}

function getHitbox(ent) {
    let p = getHitDataEntry(ent.frameId, ent.charId);
    if (p && p.length >= 8 && p[6] > 0) { 
        let flip = (ent.frameId >= 512) ? (ent.dir === 1) : (ent.dir === -1);
        return { x: ent.x + (flip ? -p[4] : p[4]) - p[6], y: ent.y + p[5] - p[7] + (ent.z >> 8), w: p[6]*2, h: p[7]*2 };
    }
    return null;
}

function getHurtbox(ent) {
    let p = getHitDataEntry(ent.frameId, ent.charId);
    if (p && p.length >= 4 && p[2] > 0) { 
        let flip = (ent.frameId >= 512) ? (ent.dir === 1) : (ent.dir === -1);
        return { x: ent.x + (flip ? -p[0] : p[0]) - p[2], y: ent.y + p[1] - p[3] + (ent.z >> 8), w: p[2]*2, h: p[3]*2 };
    }
    return null;
}

function checkCollision(hit, hurt, py, ey) {
    if (Math.abs(py - ey) > 16) return false;
    return !(hit.x + hit.w < hurt.x || hit.x > hurt.x + hurt.w || hit.y + hit.h < hurt.y || hit.y > hurt.y + hurt.h);
}

function isAttackBoxColliding(atkEnt, tgtEnt) {
    let hit = getHitbox(atkEnt);
    let hurt = getHurtbox(tgtEnt);
    if (hit && hurt) return checkCollision(hit, hurt, atkEnt.y, tgtEnt.y);
    return false;
}

function getSkleParts(frameId, charId) {
    if (frameId < 0) return null;
    let poolIdx = frameId >> 9;
    if (poolIdx > 0) poolIdx = 4 + poolIdx; 
    else poolIdx = (charId >= 0 && charId < 5) ? charId : mainPlayer;
    
    let idx = frameId & 511;
    if (skleData[poolIdx] && idx < skleData[poolIdx].length) return skleData[poolIdx][idx];
    return null;
}