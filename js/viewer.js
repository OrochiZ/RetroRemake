"use strict";

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusSpan = document.getElementById('status');
const inputId = document.getElementById('inputId');
const controls = document.getElementById('viewer-controls');
const modeSelect = document.getElementById('modeSelect');
const charSelect = document.getElementById('charSelect');
const cbIgnoreJumps = document.getElementById('cbIgnoreJumps');
const lblLoop = document.getElementById('lblLoop');

let currentMode = 'anim'; 
let currentChar = 0;
let currentId = 0;
let animCtx = { index: 0, frameId: 0, targetCharId: 0, delay: 0 };

document.getElementById('btnLoad').addEventListener('click', async () => {
    document.getElementById('btnLoad').disabled = true;
    await loadCommonResources(
        msg => statusSpan.textContent = msg,
        () => {
            statusSpan.textContent = `解析完美成功！`;
            statusSpan.className = "success";
            controls.style.display = "block";
            populateCharDropdown();
            setInterval(tickAnimation, TICK_MS); 
            updateViewer();
        },
        err => {
            statusSpan.textContent = "解析崩溃: " + err.message;
            statusSpan.className = "error";
            console.error(err);
        }
    );
    document.getElementById('btnLoad').disabled = false;
});

modeSelect.addEventListener('change', (e) => {
    currentMode = e.target.value;
    lblLoop.style.display = (currentMode === 'anim') ? 'inline-block' : 'none';
    populateCharDropdown();
    currentChar = 0; currentId = 0;
    updateViewer();
});

charSelect.addEventListener('change', (e) => { 
    currentChar = parseInt(e.target.value); 
    if (currentChar <= 4) mainPlayer = currentChar;
    currentId = 0; 
    updateViewer(); 
});
document.getElementById('btnNext').addEventListener('click', () => stepId(1));
document.getElementById('btnPrev').addEventListener('click', () => stepId(-1));
inputId.addEventListener('change', (e) => { currentId = parseInt(e.target.value); updateViewer(); });

document.addEventListener('keydown', (e) => {
    if (controls.style.display === 'none' || document.activeElement === inputId) return; 
    if (e.key === 'ArrowRight') { stepId(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { stepId(-1); e.preventDefault(); }
});

function stepId(delta) { currentId += delta; updateViewer(); }

function populateCharDropdown() {
    let oldVal = charSelect.value;
    charSelect.innerHTML = ''; 
    if (currentMode === 'map') {
        for (let i = 0; i < mapData.length; i++) charSelect.innerHTML += `<option value="${i}">场景地图 Map ${i}</option>`;
    } else {
        charSelect.innerHTML = `
            <optgroup label="玩家 (Players)">
                <option value="0">0: 关羽</option><option value="1">1: 张飞</option>
                <option value="2">2: 赵云</option><option value="3">3: 黄忠</option><option value="4">4: 魏延</option>
            </optgroup>
            <optgroup label="非玩家数据组 (8.dat Objects)">
                <option value="5">5: 敌方组 1 (杂兵/特效)</option>
                <option value="6">6: 敌方组 2 (武器/掉落)</option>
                <option value="7">7: 敌方组 3 (BOSS/战马)</option>
                <option value="8">8: 敌方组 4 (弓箭/火计等)</option>
            </optgroup>`;
    }
    if(oldVal && charSelect.querySelector(`option[value="${oldVal}"]`)) charSelect.value = oldVal;
}

function updateViewer() {
    let maxId = 0;
    if (currentMode === 'frame' || currentMode === 'sheet') maxId = skleData[currentChar] ? skleData[currentChar].length : 0;
    else if (currentMode === 'anim') {
        maxId = motionData[currentChar] ? motionData[currentChar].length : 0;
        animCtx = { index: 0, frameId: 0, targetCharId: currentChar, delay: 0 }; 
    } else if (currentMode === 'map') {
        maxId = 999; 
    }
    
    if (maxId === 0) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
    if (currentId < 0) currentId = maxId - 1;
    if (currentId >= maxId) currentId = 0;
    inputId.value = currentId;

    if (currentMode !== 'map' && currentMode !== 'sheet') {
        canvas.width = 400; canvas.height = 400;
        ctx.imageSmoothingEnabled = false;
    }

    if (currentMode === 'frame') drawComposedSprite(currentChar, currentId, 200, 280, true, true);
    else if (currentMode === 'sheet') drawSpriteSheet(currentChar);
    else if (currentMode === 'map') drawMap(currentChar);
}

function tickAnimation() {
    if (currentMode !== 'anim') return;
    let seqs = motionData[currentChar];
    if (!seqs) return;
    let seq = seqs[currentId];
    if (!seq || seq.length === 0) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }

    if (animCtx.delay > 0) { 
        animCtx.delay--; 
    } else {
        let loopProtect = 0;
        while (loopProtect++ < 50) {
            let op = seq[animCtx.index++];
            if (op === undefined) { animCtx.index = 0; break; }

            // 【修复】：补上 4 + poolIdx，让敌兵的动作能正确映射回 5,6,7,8 号数据池
            if (op < 4096) {
                let poolIdx = op >> 9;
                animCtx.frameId = op & 511;
                
                animCtx.targetCharId = currentChar;
                if (poolIdx > 0) animCtx.targetCharId = 4 + poolIdx;
                else if (currentChar > 4) animCtx.targetCharId = mainPlayer;

                animCtx.delay = seq[animCtx.index++];
                break;
            }

            switch(op) {
                case 4096: animCtx.index = seq[animCtx.index] * 2; break; 
                case 4097: 
                    if (cbIgnoreJumps.checked) animCtx.index = 0;
                    else {
                        let nextId = seq[animCtx.index];
                        if (nextId >= 0 && nextId < seqs.length) {
                            currentId = nextId; inputId.value = currentId;
                            seq = seqs[currentId]; animCtx.index = 0;
                        } else animCtx.index = 0; 
                    }
                    break;
                case 4098: 
                    if (cbIgnoreJumps.checked) animCtx.index = 0;
                    else animCtx.index--; 
                    return; 
                case 4099: 
                    animCtx.targetCharId = currentChar > 4 ? mainPlayer : currentChar;
                    animCtx.frameId = 0; animCtx.delay = seq[animCtx.index++]; break;
                case 4101: case 4103: case 4105: case 4106: case 4107: 
                case 4109: case 4111: case 4112: case 4113: animCtx.index++; break;
            }
        }
    }
    drawComposedSprite(animCtx.targetCharId, animCtx.frameId, 200, 280, true, true);
}

async function drawComposedSprite(charId, frameId, anchorX, anchorY, showDebug = true, clearCanvas = true) {
    let parts = skleData[charId] ? skleData[charId][frameId] : null;
    if (clearCanvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!parts) return;

    let promises =[];
    for(let part of parts) promises.push(ensureImageLoaded(getGlobalImageId(part.imgId)));
    await Promise.all(promises);

    for (let i = parts.length - 1; i >= 0; i--) {
        let part = parts[i];
        let img = imageCache[getGlobalImageId(part.imgId)];
        if (img) ctx.drawImage(img, anchorX + part.ox, anchorY + part.oy);
    }

    if (showDebug) {
        ctx.strokeStyle = "rgba(0, 255, 0, 0.8)"; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(anchorX - 10, anchorY); ctx.lineTo(anchorX + 10, anchorY);
        ctx.moveTo(anchorX, anchorY - 10); ctx.lineTo(anchorX, anchorY + 10); ctx.stroke();

        let hc = charId; 
        if (hitData[hc] && frameId < hitData[hc].length) {
            let p = hitData[hc][frameId];
            if (p && p.length >= 4 && p[2] > 0) {
                ctx.fillStyle = "rgba(0, 100, 255, 0.4)"; ctx.strokeStyle = "blue";
                let hx = anchorX + p[0] - p[2], hy = anchorY + p[1] - p[3], hw = p[2] * 2, hh = p[3] * 2;
                ctx.fillRect(hx, hy, hw, hh); ctx.strokeRect(hx, hy, hw, hh);
            }
            if (p && p.length >= 8 && p[6] > 0) {
                ctx.fillStyle = "rgba(255, 0, 0, 0.4)"; ctx.strokeStyle = "red";
                let ax = anchorX + p[4] - p[6], ay = anchorY + p[5] - p[7], aw = p[6] * 2, ah = p[7] * 2;
                ctx.fillRect(ax, ay, aw, ah); ctx.strokeRect(ax, ay, aw, ah);
            }
        }
    }
}

async function drawSpriteSheet(charId) {
    let frames = skleData[charId]; if(!frames) return;
    const cols = 6, cellW = 180, cellH = 180;
    const rows = Math.ceil(frames.length / cols);
    canvas.width = cols * cellW; canvas.height = rows * cellH;
    ctx.imageSmoothingEnabled = false; 
    ctx.clearRect(0, 0, canvas.width, canvas.height); 

    let promises =[];
    for (let f = 0; f < frames.length; f++) {
        for (let part of frames[f]) promises.push(ensureImageLoaded(getGlobalImageId(part.imgId)));
    }
    await Promise.all(promises);

    for (let f = 0; f < frames.length; f++) {
        let col = f % cols, row = Math.floor(f / cols);
        ctx.strokeStyle = "#444"; ctx.strokeRect(col * cellW, row * cellH, cellW, cellH);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText(`F ${f}`, col * cellW + 5, row * cellH + 15);
        await drawComposedSprite(charId, f, col * cellW + cellW/2, row * cellH + cellH - 30, true, false);
    }
}

async function drawMap(mapId) {
    let map = mapData[mapId]; if(!map) return;
    canvas.width = 800; canvas.height = 400;
    ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#1e3b5e"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    let promises =[];
    for(let part of map) promises.push(ensureImageLoaded(getGlobalImageId(part.imgId)));
    await Promise.all(promises);
    
    let cameraX = currentId * 50; 
    for (let i = map.length - 1; i >= 0; i--) {
        let part = map[i];
        let img = imageCache[getGlobalImageId(part.imgId)];
        if (img) ctx.drawImage(img, part.ox - cameraX, part.oy + 42);
    }
}