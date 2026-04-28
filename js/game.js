"use strict";

let gs = new Int32Array(144); 
let entities =[], cameraX = 0, lastLogicTime = 0;

function playSoundEffect(id) { /* 未来扩展音频 */ }

function startGame() {
    initGame();
    requestAnimationFrame(mainLoop);
}

function initGame() {
    mainPlayer = 0; 
    entities =[];
    let player = new Entity(mainPlayer, 1, 100, 180);
    gs[25] = 0; player.setAnim(2); 
    entities.push(player);
    
    let enemy = new Entity(5, 9, 250, 180); 
    enemy.dir = -1; enemy.setAnim(93 + (enemy.type - 2) * 24); 
    entities.push(enemy);
}

function mainLoop(time) {
    requestAnimationFrame(mainLoop);
    if (!lastLogicTime) lastLogicTime = time;
    let delta = time - lastLogicTime;
    if (delta > 200) { lastLogicTime = time - TICK_MS; delta = TICK_MS; }

    if (delta >= TICK_MS) {
        let ticks = Math.floor(delta / TICK_MS);
        for (let i = 0; i < ticks; i++) {
            pollInput();
            updateInGameLogic(); 
        }
        lastLogicTime += ticks * TICK_MS;
        drawRender(); 
    }
}

function updateInGameLogic() {
    let p = entities[0];

    if (gs[75] > 0) {
        gs[75]--; 
    } else {
        for (let ent of entities) advanceAnim(ent);
    }

    updatePlayerLogic_OnFoot();

    for (let i = 1; i < entities.length; i++) {
        let e = entities[i];
        
        if (e.invincibilityTimer > 0 && e.state !== 1 && e.state !== 10 && e.state !== 12) e.invincibilityTimer--;
        
        if (e.state === 37) { 
            e.stateTimer--; e.x += e.vx; 
            if (e.delay < 0 || e.stateTimer <= 0) {
                e.state = 0; e.setAnim(93 + (e.type - 2) * 24); e.vx = 0; 
            }
        } else if (e.state === 1) { 
            e.stateTimer++;
            if (e.stateTimer < KNOCKDOWN_Z.length) {
                e.offsetY += KNOCKDOWN_Z[e.stateTimer]; 
                // 【修复3】：严格遵守 J2ME 投掷的高额初速度，不再写死移动距离
                if (e.vx !== 0) {
                    e.x += e.vx;
                } else {
                    e.x += (e.dir === 1 ? -6 : 6);
                }
            } else {
                e.offsetY = 0;
            }
            
            if (e.stateTimer > 30) {
                e.state = 0; e.setAnim(93 + (e.type - 2) * 24); 
                e.invincibilityTimer = 0; 
                e.vx = 0;
            } else {
                e.invincibilityTimer = 999; 
            }
        } else if (e.state === 10) {
            // 【修复1】：完美还原 J2ME 膝撞的坐标偏移与朝向
            e.dir = -p.dir; // 永远面朝主角
            if (p.animSeq === 20) { 
                // 抓举待机
                e.x = p.x + (p.dir === 1 ? 33 : -33);
                e.y = p.y;
                e.z = 0;
            } else if (p.animSeq === 16) { 
                // 膝撞动作中
                if (p.animIdx <= 2) {
                    e.z = -13312; // 稍微抬起
                    e.x = p.x;
                } else {
                    e.z = -11264; // 被膝盖顶到半空
                    e.x = p.x + (p.dir === 1 ? -8 : 8); // 略微拉近主角
                }
            }
        } else if (e.state === 12) {
            // 【修复4】：空中大坐跟随飞行，受主角横向移动 (vx) 影响
            e.x = p.x;
            e.y = p.y;
            e.z = p.z - 13824; 
            e.dir = -p.dir;
        }
    }

    if (p.x > cameraX + 240) cameraX = p.x - 240;
    if (p.x < cameraX + 80 && cameraX > 0) cameraX = p.x - 80;
    if (cameraX < 0) cameraX = 0;
    if (p.x < cameraX + 15) p.x = cameraX + 15;
    if (p.y < 140) p.y = 140;
    if (p.y > 230) p.y = 230;
}

function checkAndHandleDashInput() {
    let pressed = inputManager.keyState[1]; 
    if (pressed & (MASK_LEFT | MASK_RIGHT)) {
        if (gs[79] > 0 && (gs[80] & pressed)) {
            gs[79] = 0; return true; 
        }
        gs[79] = 6; gs[80] = pressed & (MASK_LEFT | MASK_RIGHT);
    } else if (gs[79] > 0) gs[79]--;
    return false;
}

function checkAndHandleUppercutInput() {
    let pressed = inputManager.keyState[1];
    if (pressed & MASK_UP) {
        if (gs[103] > 0 && (gs[104] & pressed)) {
            gs[103] = 0; return true; 
        }
        gs[103] = 6; gs[104] = pressed & MASK_UP;
    } else if (gs[103] > 0) gs[103]--;
    return false;
}

function findGrabbableEnemy(p, w, h) {
    for (let i = 1; i < entities.length; i++) {
        let e = entities[i];
        if (e.type !== 0 && e.invincibilityTimer <= 0 && e.state !== 1 && e.state !== 5 && e.state !== 10 && e.state !== 12) {
            let dx = Math.abs(e.x - p.x); let dy = Math.abs(e.y - p.y);
            if (dx < w && dy < h) return e;
        }
    }
    return null;
}

function updatePlayerLogic_OnFoot() {
    let p = entities[0];
    let j = 0, k = 0;
    let stateJustChanged = false;

    do {
        stateJustChanged = false;
        
        if (gs[25] < 2) {
            if (gs[75] <= 0) gs[20] = 0;

            if (checkAndHandleUppercutInput()) {
                gs[25] = 20; gs[20] = 14;
                p.setAnim(39); gs[81] = 54; gs[82] = 10;
                p.invincibilityTimer = 30; 
                p.vx = p.dir === 1 ? 6 : -6; p.vz = 3328; p.z = -1;
                stateJustChanged = true; break;
            }

            if (checkAndHandleDashInput()) {
                if ((inputManager.keyState[0] & MASK_RIGHT) !== 0) { p.dir = 1; p.vx = 12; } 
                else if ((inputManager.keyState[0] & MASK_LEFT) !== 0) { p.dir = -1; p.vx = -12; }
                gs[25] = 8; gs[20] = 7;
                p.setAnim(7); gs[81] = 54; gs[82] = 4;
                stateJustChanged = true; break;
            }

            if (isActionHeld(MASK_ATTACK)) {
                if (handlePlayerComboFinisher()) { stateJustChanged = true; } 
                else if (gs[25] !== 11) {
                    gs[20] = 3; gs[75] = 0;
                    p.setAnim(3); gs[25] = 2; gs[19] = 12;
                }
            } else if (isActionPressed(MASK_JUMP)) {
                gs[25] = 9; p.vx = 0; p.vy = 0; p.vz = 3328;
                gs[20] = 8; gs[81] = 52; gs[82] = 12;
                p.setAnim(8); stateJustChanged = true;
            } else if (isActionPressed(MASK_MAGIC) && p.hp > 6) {
                gs[25] = 33; p.setAnim(5); handleDesperationMove(1); stateJustChanged = true;
            } else if (isActionPressed(MASK_MOUNT_MAGIC) && p.hp > 6) {
                gs[25] = 33; p.setAnim(33); handleDesperationMove(2); stateJustChanged = true;
            } else {
                if (gs[25] !== 8) {
                    if (inputManager.isDirectionHeld[1]) k = -3;
                    else if (inputManager.isDirectionHeld[3]) k = 3;

                    if (inputManager.isDirectionHeld[2]) { p.dir = 1; j = 5; }
                    else if (inputManager.isDirectionHeld[0]) { p.dir = -1; j = -5; }

                    if (gs[25] !== 0) {
                        if (!inputManager.isDirectionHeld[0] && !inputManager.isDirectionHeld[1] && !inputManager.isDirectionHeld[2] && !inputManager.isDirectionHeld[3]) {
                            gs[25] = 0; p.setAnim(2);
                        }
                    } else if (inputManager.isDirectionHeld[0] || inputManager.isDirectionHeld[1] || inputManager.isDirectionHeld[2] || inputManager.isDirectionHeld[3]) {
                        gs[25] = 1; p.setAnim(1);
                    }
                }
                
                if (j !== 0 || k !== 0) {
                    let tgt = findGrabbableEnemy(p, 30, 12);
                    if (tgt && (tgt.state === 0 || tgt.state === 37)) {
                        gs[25] = 10; gs[26] = tgt; gs[83] = 0; 
                        p.setAnim(20); p.vx = 0; p.vy = 0;
                        tgt.state = 10; tgt.setAnim(109 + (tgt.type - 2) * 24);
                        tgt.vx = 0; tgt.vy = 0; tgt.dir = -p.dir;
                        tgt.x = p.x + (p.dir === 1 ? 33 : -33); tgt.y = p.y;
                        stateJustChanged = true; break;
                    }
                }

                if (p.animSeq === 23 && p.delay < 0) p.setAnim(0);
            }
        } else if (gs[25] <= 3) {
            if (p.animSeq !== 3 && p.animSeq !== 4 && p.animSeq !== 6) {
                if (gs[25] === 2) { gs[25] = 0; } 
                else {
                    gs[20] = gs[21]; p.setAnim(gs[20]);
                    gs[25] = 2; gs[19] = 10;
                }
            }
            updateComboAttackLogic();
            if (gs[25] === 2) handlePlayerComboFinisher();
            
        } else if (gs[25] === 8) {
            if (p.delay < 0) {
                gs[25] = 0; gs[20] = 0; p.setAnim(2); p.z = 0;
            } else {
                j = p.vx; k = p.vy;
                if (isActionHeld(MASK_JUMP)) {
                    p.setAnim(35); gs[82] = 16; p.vx = p.vx > 0 ? 6 : -6;
                } else if (isActionHeld(MASK_ATTACK)) {
                    p.setAnim(36); gs[82] = 8; p.vx = p.vx > 0 ? 6 : -6;
                }
            }
        } else if (gs[25] === 9) {
            p.z -= p.vz; p.vz -= 512;
            if (p.vx === 0 && p.vz > 0) {
                if (isActionHeld(MASK_RIGHT)) p.vx = 3;
                else if (isActionHeld(MASK_LEFT)) p.vx = -3;
            }
            if (p.z >= 0) {
                p.z = 0; p.vx = 0; gs[25] = 0; p.setAnim(2);
            }
            j = p.vx; k = p.vy;
        } else if (gs[25] === 20) { 
            p.z -= p.vz;
            if (p.z < 0) {
                p.vz -= 512;
            } else if (p.vx !== 0) {
                p.z = 0; p.vx = 0; p.vz = 0; p.delay = 0; p.invincibilityTimer = 0;
            } else if (p.delay < 0) {
                gs[20] = 0; gs[25] = 0; p.setAnim(2);
            }
            j = p.vx; k = 0;
        } else if (gs[25] === 33) {
            p.stateTimer++;
            if (p.delay < 0) { gs[25] = 0; p.setAnim(2); p.z = 0; }
        } else if (gs[25] === 10) { 
            let e = gs[26];
            if (p.animSeq === 20) {
                // 【修复2】：严格判定 isActionPressed 避免按住键连发，脱手逻辑在此触发
                if (isActionPressed(MASK_ATTACK)) {
                    if (isActionHeld(MASK_LEFT) || isActionHeld(MASK_RIGHT)) {
                        p.dir = isActionHeld(MASK_RIGHT) ? 1 : -1;
                        startGrabAndThrow(p, e, 20); 
                    } else {
                        p.setAnim(16); 
                        if (e) {
                            e.hp = Math.max(0, e.hp - 8); // 确实扣血
                            gs[83]++; // 累计打击次数
                            e.setAnim(107 + (e.type - 2) * 24); // 275 受伤动画
                        }
                    }
                } else if (isActionPressed(MASK_JUMP)) {
                    gs[25] = 34; p.vz = 6144; p.setAnim(18); 
                    if (e) { 
                        e.state = 12; 
                        e.setAnim(108 + (e.type - 2) * 24); // 276 绑定跟随下坠
                    }
                }
            } else if (p.animSeq === 16 && p.delay < 0) { 
                // 膝撞动画结束
                if (gs[83] >= 3 || (e && e.hp <= 0)) {
                    // 第3下或血条归零：强行脱手击飞
                    if (e) handleEnemyKnockback(entities.indexOf(e), true, 3);
                    gs[25] = 0; p.setAnim(2);
                } else {
                    // 恢复抓取状态
                    p.setAnim(20); 
                    if (e) {
                        e.setAnim(109 + (e.type - 2) * 24); // 277 被抓待机
                        e.z = 0;
                    }
                }
            }
        } else if (gs[25] === 34) {
            // 【修复4】：空中大坐提供横向操控位移
            if (isActionHeld(MASK_LEFT)) p.vx = -4;
            else if (isActionHeld(MASK_RIGHT)) p.vx = 4;
            else p.vx = 0;

            p.z -= p.vz; p.vz -= 512;
            let e = gs[26];
            
            if (p.z >= 0) {
                p.z = 0; p.vx = 0; p.vz = 0;
                gs[25] = 11; p.setAnim(41); // 大坐落地硬直
                if (e && e.state === 12) {
                    e.z = 0; e.hp = Math.max(0, e.hp - 32); // 落地巨额伤害
                    handleEnemyKnockback(entities.indexOf(e), true, 3);
                }
                playSoundEffect(24);
            }
            j = p.vx; // 让末尾的 p.x += j 把速度生效
        } else if (gs[25] === 11) {
            if (p.delay < 0) { gs[25] = 0; p.setAnim(2); p.z = 0; }
        }

        p.x += j; p.y += k;

    } while(stateJustChanged);

    updateAttackLogic();
}

function startGrabAndThrow(p, e, damage) {
    p.setAnim(17); 
    gs[25] = 11; 
    if (e) {
        e.hp = Math.max(0, e.hp - damage);
        e.state = 1; e.stateTimer = 0; e.stunAccum = 0;
        e.invincibilityTimer = 999;
        e.dir = -p.dir; 
        e.vx = p.dir === 1 ? 12 : -12; // 关键：高额脱手抛掷初速度
        e.offsetY += KNOCKDOWN_Z[0];
        e.setAnim(108 + (e.type - 2) * 24); // 276 被投掷坠落
    }
}

function handlePlayerComboFinisher() {
    if (gs[63] === 0 && --gs[19] > 0 && COMBO_FINISHER_TABLE[gs[20]] !== 0 && isActionHeld(MASK_ATTACK) && gs[75] !== 0) {
        gs[19] = 0; gs[75] = 0; gs[25] = 3; gs[21] = COMBO_FINISHER_TABLE[gs[20]];
        return true;
    }
    return false;
}

function updateComboAttackLogic() {
    let p = entities[0];
    if (gs[25] > 1 && gs[25] < 4) {
        for (let i = 1; i < entities.length; i++) {
            let e = entities[i];
            if (e.type !== 0 && e.invincibilityTimer === 0 && (e.flags & 1) !== 0) {
                if (isAttackBoxColliding(p, e) && !p.hitEntities.includes(e)) {
                    p.hitEntities.push(e); gs[75] = 5; 
                    p.lastAttackAnimId = 0;
                    applyDamageToEnemy(i, false, p.hitDamage, true);
                }
            }
        }
    }
}

function updateAttackLogic() {
    let p = entities[0];
    if (gs[20] >= 7 || gs[25] === 20) {
        for (let i = 1; i < entities.length; i++) {
            let e = entities[i];
            if (e.type !== 0 && (e.flags & 1) !== 0 && e.invincibilityTimer === 0) {
                let dy = Math.abs(p.y - e.y);
                if (dy < gs[82] && isAttackBoxColliding(p, e) && !p.hitEntities.includes(e)) {
                    p.hitEntities.push(e); gs[75] = 5;
                    applyDamageToEnemy(i, false, p.hitDamage, true);
                }
            }
        }
    }
}

function applyDamageToEnemy(i, isKnockdown, damage, showHitEffect) {
    let p = entities[0]; let e = entities[i];
    e.dir = p.x > e.x ? 1 : -1;
    
    e.hp -= damage;
    if (e.hp < 0) e.hp = 0;
    
    if (e.hitstunTimer === 0) e.hitstunTimer = 15;
    e.stunAccum += p.hitstunTimer || 2; 

    let forceKnock = false;
    if (e.stunAccum >= 6) { forceKnock = true; e.stunAccum = 0; }

    e.state = 3; e.stateTimer = 2; 
    handleEnemyKnockback(i, forceKnock || isKnockdown, 3);
}

function handleEnemyKnockback(i, forceKnockdown, invincTime) {
    let p = entities[0]; let e = entities[i];
    if (e.hp > 0) {
        if (!forceKnockdown && gs[20] !== 6 && e.z === 0) {
            e.setAnim(105 + (e.type - 2) * 24); 
            e.invincibilityTimer = invincTime;
            e.state = 37;
            e.vx = p.x > e.x ? -4 : 4;
            e.stateTimer = 3;
        } else {
            e.setAnim(108 + (e.type - 2) * 24); 
            e.state = 1; e.stateTimer = 0;
            e.invincibilityTimer = 999;
            e.stunAccum = 0;
            e.offsetY += KNOCKDOWN_Z[0];
        }
    } else {
        e.state = 5; e.setAnim(107 + (e.type - 2) * 24);
        e.offsetY += KNOCKDOWN_Z[0];
    }
}

function handleDesperationMove(level) {
    let p = entities[0];
    for (let i = 1; i < entities.length; i++) {
        let e = entities[i];
        if (e.type !== 0 && e.state !== 5 && e.state !== 1 && (e.flags & 1) !== 0 && p.hp > 6) {
            let dx = Math.abs(e.x - p.x); let dy = Math.abs(e.y - p.y);
            if (dx < 64 * level && dy < 32 * level && !p.hitEntities.includes(e)) {
                p.hitEntities.push(e); p.hp -= 6; 
                applyDamageToEnemy(i, true, 8, true);
            }
        }
    }
}

async function drawRender() {
    const ctx = document.getElementById('canvas').getContext('2d');
    ctx.fillStyle = "#1e3b5e"; ctx.fillRect(0, 0, 400, 300);

    let map = mapData[0];
    if (map) {
        let promises =[];
        for (let part of map) promises.push(ensureImageLoaded(getGlobalImageId(part.imgId)));
        await Promise.all(promises);
        for (let i = map.length - 1; i >= 0; i--) {
            let part = map[i], img = imageCache[getGlobalImageId(part.imgId)];
            if (img) ctx.drawImage(img, part.ox - cameraX, part.oy + 42);
        }
    }

    let renderList = [...entities].sort((a, b) => a.y - b.y);
    let shadowImg = await ensureImageLoaded(288);
    for (let ent of renderList) if (shadowImg) ctx.drawImage(shadowImg, ent.x - cameraX - 24, ent.y + 42 - 8);

    for (let ent of renderList) {
        if (ent.frameId < 0) continue;
        let parts = getSkleParts(ent.frameId, ent.charId);
        if (!parts) continue;

        let promises =[];
        for (let part of parts) promises.push(ensureImageLoaded(getGlobalImageId(part.imgId)));
        await Promise.all(promises);

        let renderX = ent.x - cameraX, renderY = ent.y + 42 + (ent.z >> 8) + ent.offsetY; 

        let isEnemy = ent.frameId >= 512; 
        let flip = isEnemy ? (ent.dir === 1) : (ent.dir === -1);

        ctx.save();
        if (!flip) {
            for (let i = parts.length - 1; i >= 0; i--) {
                let part = parts[i], img = imageCache[getGlobalImageId(part.imgId)];
                if (img) ctx.drawImage(img, renderX + part.ox, renderY + part.oy);
            }
        } else {
            for (let i = parts.length - 1; i >= 0; i--) {
                let part = parts[i], img = imageCache[getGlobalImageId(part.imgId)];
                if (img) {
                    ctx.save();
                    ctx.translate(renderX, renderY + part.oy);
                    ctx.scale(-1, 1);
                    ctx.drawImage(img, part.ox, 0); 
                    ctx.restore();
                }
            }
        }
        ctx.restore();

        if (showHitboxes) {
            ctx.strokeStyle = "rgba(0, 255, 0, 0.8)"; ctx.lineWidth = 1; ctx.beginPath();
            ctx.moveTo(renderX - 10, renderY); ctx.lineTo(renderX + 10, renderY);
            ctx.moveTo(renderX, renderY - 10); ctx.lineTo(renderX, renderY + 10); ctx.stroke();

            let hurt = getHurtbox(ent);
            if (hurt) {
                ctx.fillStyle = "rgba(0, 100, 255, 0.4)"; ctx.strokeStyle = "blue";
                ctx.fillRect(hurt.x - cameraX, hurt.y + 42 + ent.offsetY, hurt.w, hurt.h); 
                ctx.strokeRect(hurt.x - cameraX, hurt.y + 42 + ent.offsetY, hurt.w, hurt.h);
            }
            let hit = getHitbox(ent);
            if (hit) {
                ctx.fillStyle = "rgba(255, 0, 0, 0.4)"; ctx.strokeStyle = "red";
                ctx.fillRect(hit.x - cameraX, hit.y + 42 + ent.offsetY, hit.w, hit.h); 
                ctx.strokeRect(hit.x - cameraX, hit.y + 42 + ent.offsetY, hit.w, hit.h);
            }
        }

        if (ent.type !== 1) {
            ctx.fillStyle = "red"; ctx.fillRect(renderX - 20, renderY - 80, 40 * (ent.hp/ent.maxHp), 5);
            ctx.strokeStyle = "white"; ctx.strokeRect(renderX - 20, renderY - 80, 40, 5);
        }
    }
}