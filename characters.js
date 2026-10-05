// ============================================================================
// CHARACTERS.JS - DUAL-ENGINE: DYNAMIC ADOBE FLXANIMATE ATLAS + SPARROW XML
// ============================================================================

function extractMatrix(el) {
    if (el.MX) {
        return new PIXI.Matrix(...el.MX);
    } else if (el.M3D) {
        return new PIXI.Matrix(el.M3D[0], el.M3D[1], el.M3D[4], el.M3D[5], el.M3D[12], el.M3D[13]);
    }
    return new PIXI.Matrix();
}

function parseSparrowAtlas(baseTexture, xmlDoc) {
    const subTextures = xmlDoc.getElementsByTagName("SubTexture");
    const anims = {};

    for (let i = 0; i < subTextures.length; i++) {
        const sub = subTextures[i];
        const rawName = sub.getAttribute("name");
        if (!rawName) continue;

        const match = rawName.match(/^(.*?)([0-9]{4})$/);
        const animName = match ? match[1] : rawName;

        const x = parseInt(sub.getAttribute("x") || 0, 10);
        const y = parseInt(sub.getAttribute("y") || 0, 10);
        const width = parseInt(sub.getAttribute("width") || 0, 10);
        const height = parseInt(sub.getAttribute("height") || 0, 10);

        const frameX = parseInt(sub.getAttribute("frameX") || 0, 10);
        const frameY = parseInt(sub.getAttribute("frameY") || 0, 10);
        const frameWidth = parseInt(sub.getAttribute("frameWidth") || width, 10);
        const frameHeight = parseInt(sub.getAttribute("frameHeight") || height, 10);

        const rect = new PIXI.Rectangle(x, y, width, height);
        const orig = new PIXI.Rectangle(0, 0, frameWidth, frameHeight);
        const trim = new PIXI.Rectangle(-frameX, -frameY, width, height);

        const texture = new PIXI.Texture(baseTexture, rect, orig, trim);

        if (!anims[animName]) anims[animName] = [];
        anims[animName].push(texture);
    }
    return anims;
}

// ----------------------------------------------------------------------------
// 1. SPARROW CHARACTER RUNTIME (DETECTIVE & CLASSIC CHARACTERS)
// ----------------------------------------------------------------------------
class SparrowCharacter {
    constructor(baseTexture, anims, charConfig = {}, isPlayer = false) {
        this.anims = anims;
        this.charConfig = charConfig;
        this.isPlayer = isPlayer;

        this.container = new PIXI.Container();
        this.sprite = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
        this.sprite.anchor.set(0.5, 1.0);
        this.container.addChild(this.sprite);

        this.animOffsets = {};
        if (charConfig.animations) {
            charConfig.animations.forEach(a => {
                this.animOffsets[a.anim.toLowerCase()] = a.offsets || [0, 0];
            });
        }

        const scale = charConfig.scale || 1.0;
        this.container.scale.set(charConfig.flipX ? -scale : scale, scale);

        this.holdTimer = 0;
        this.currentAnim = 'idle';
        this.playAnim('idle');
    }

    playAnim(animName, forced = false) {
        const clean = animName.toLowerCase().replace(/[^a-z0-9]/g, '');
        let targetKey = Object.keys(this.anims).find(k => {
            const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            return kClean === clean || kClean.startsWith(clean) || clean.startsWith(kClean);
        });

        if (!targetKey && animName.includes('idle')) {
            targetKey = Object.keys(this.anims).find(k => k.toLowerCase().includes('idle'));
        }

        if (!targetKey || !this.anims[targetKey]) return;

        this.currentAnim = animName;
        this.sprite.textures = this.anims[targetKey];
        this.sprite.loop = false;
        this.sprite.animationSpeed = 24 / 60;
        this.sprite.gotoAndPlay(0);

        if (!animName.includes('idle')) {
            this.holdTimer = 0.35;
        }

        const offset = this.animOffsets[clean] || [0, 0];
        this.sprite.position.set(-offset[0], -offset[1]);
    }

    update(deltaSec) {
        if (this.holdTimer > 0) {
            this.holdTimer -= deltaSec;
            if (this.holdTimer <= 0) {
                this.playAnim('idle');
            }
        }
    }
}

// ----------------------------------------------------------------------------
// 2. DYNAMIC TEXTURE ATLAS CHARACTER (ADOBE ANIMATE / FLXANIMATE RUNTIME)
// ----------------------------------------------------------------------------
class DynamicAtlasCharacter {
    constructor(baseTexture, animJson, spritemapJson, charName = '', isPlayer = false, isGF = false) {
        this.charName = charName.toLowerCase();
        this.isPlayer = isPlayer;
        this.isGF = isGF;
        this.isPico = this.charName.includes('pico');
        
        this.container = new PIXI.Container();
        this.displayContainer = new PIXI.Container();
        this.container.addChild(this.displayContainer);

        this.spritemap = {};
        for (const item of spritemapJson.ATLAS.SPRITES) {
            const s = item.SPRITE;
            this.spritemap[s.name] = new PIXI.Texture(baseTexture, new PIXI.Rectangle(s.x, s.y, s.w, s.h));
        }

        this.symbols = {};
        if (animJson.SD && animJson.SD.S) {
            for (const s of animJson.SD.S) {
                this.symbols[s.SN] = s;
            }
        }

        const rootMatrices = {};
        if (animJson.AN && animJson.AN.TL && animJson.AN.TL.L) {
            for (const layer of animJson.AN.TL.L) {
                for (const fr of layer.FR || []) {
                    for (const el of fr.E || []) {
                        if (el.SI && el.SI.SN) {
                            rootMatrices[el.SI.SN] = extractMatrix(el.SI);
                        }
                    }
                }
            }
        }

        this.animMap = {};
        this.animMatrices = {};
        
        for (const symName of Object.keys(this.symbols)) {
            const lower = symName.toLowerCase();
            const isCopyOrAlt = lower.includes('copy') || lower.includes('alt') || lower.includes('shift') || lower.includes('dark');

            const assignAnim = (key) => {
                this.animMap[key] = symName;
                this.animMatrices[key] = rootMatrices[symName] || new PIXI.Matrix();
            };

            if (this.isGF) {
                if (lower.includes('idle1') || lower.includes('idleleft')) assignAnim('idleleft');
                if (lower.includes('idle2') || lower.includes('idleright')) assignAnim('idleright');
                if (lower.includes('cheer')) assignAnim('cheer');
                if (lower.includes('sad')) assignAnim('sad');
            } else {
                if (lower.includes('idle') && !isCopyOrAlt && !this.animMap['idle']) assignAnim('idle');
                else if (lower.includes('left') && !lower.includes('miss') && !isCopyOrAlt && !this.animMap['left']) {
                    assignAnim('left'); assignAnim('singleft');
                }
                else if (lower.includes('down') && !lower.includes('miss') && !isCopyOrAlt && !this.animMap['down']) {
                    assignAnim('down'); assignAnim('singdown');
                }
                else if (lower.includes('up') && !lower.includes('miss') && !isCopyOrAlt && !this.animMap['up']) {
                    assignAnim('up'); assignAnim('singup');
                }
                else if (lower.includes('right') && !lower.includes('miss') && !isCopyOrAlt && !this.animMap['right']) {
                    assignAnim('right'); assignAnim('singright');
                }

                if (lower.includes('lock in')) assignAnim('lock in');
                if (lower.includes('cock')) assignAnim('cock');
                if (lower.includes('blast')) assignAnim('blast');

                if (lower.includes('miss')) {
                    if (lower.includes('left')) assignAnim('singleftmiss');
                    if (lower.includes('down')) assignAnim('singdownmiss');
                    if (lower.includes('up')) assignAnim('singupmiss');
                    if (lower.includes('right')) assignAnim('singrightmiss');
                }
            }
        }

        this.currentAnim = this.isGF ? 'idleleft' : 'idle';
        this.frame = 0;
        this.frameTimer = 0;
        this.holdTimer = 0;
        this.fps = 24;

        // V-Slice native scale
        const scale = 1.0;
        this.container.scale.set(this.isPlayer ? scale : (this.isGF ? scale : -scale), scale);

        this.renderCurrentFrame();
    }

    playAnim(animName, forced = false) {
        const clean = animName.toLowerCase().replace(/[^a-z0-9]/g, '');
        let targetKey = Object.keys(this.animMap).find(k => k === clean || clean.includes(k));

        if (!targetKey && animName.includes('idle')) targetKey = this.isGF ? 'idleleft' : 'idle';
        if (!targetKey) targetKey = this.isGF ? 'idleleft' : 'idle';

        if (this.animMap[targetKey]) {
            this.currentAnim = targetKey;
            this.frame = 0;
            this.frameTimer = 0;
            if (!targetKey.includes('idle')) {
                this.holdTimer = 0.35;
            }
            this.renderCurrentFrame();
        }
    }

    renderCurrentFrame() {
        const symName = this.animMap[this.currentAnim];
        const sym = this.symbols[symName];
        if (!sym) return;

        this.displayContainer.removeChildren();

        const self = this;
        function renderSymbol(name, frameNum, parentMat, target) {
            const currentSym = self.symbols[name];
            if (!currentSym || !currentSym.TL || !currentSym.TL.L) return;

            // Flash Layer Stacking Rule: Reverse traversal draws back layers first
            for (let l = currentSym.TL.L.length - 1; l >= 0; l--) {
                const layer = currentSym.TL.L[l];
                if (!layer.FR || layer.FR.length === 0) continue;

                let activeFR = null;
                for (const fr of layer.FR) {
                    if (frameNum >= fr.I && frameNum < fr.I + fr.DU) {
                        activeFR = fr;
                        break;
                    }
                }

                if (!activeFR) activeFR = layer.FR[layer.FR.length - 1];
                if (!activeFR || !activeFR.E) continue;

                for (const el of activeFR.E) {
                    if (el.ASI) {
                        const tex = self.spritemap[el.ASI.N];
                        if (tex) {
                            const spr = new PIXI.Sprite(tex);
                            const localMat = extractMatrix(el.ASI);
                            const finalMat = parentMat.clone().append(localMat);
                            spr.transform.setFromMatrix(finalMat);
                            target.addChild(spr);
                        }
                    } else if (el.SI) {
                        let subFrame = 0;
                        if (el.SI.LP === "SF") {
                            subFrame = el.SI.FF || 0;
                        } else {
                            subFrame = (frameNum - activeFR.I + (el.SI.FF || 0));
                        }

                        const localMat = extractMatrix(el.SI);
                        const finalMat = parentMat.clone().append(localMat);
                        renderSymbol(el.SI.SN, subFrame, finalMat, target);
                    }
                }
            }
        }

        const animMatrix = this.animMatrices[this.currentAnim] || new PIXI.Matrix();
        const rootMat = animMatrix.clone();
        
        // Exact root counter-offsets for Flash canvas alignment
        if (this.isPico) {
            rootMat.translate(116, -180);
        } else if (this.isPlayer) {
            rootMat.translate(-405, -280);
        } else if (this.isGF) {
            rootMat.translate(-350, -320);
        } else {
            rootMat.translate(-200, -320);
        }

        renderSymbol(symName, this.frame, rootMat, this.displayContainer);
    }

    update(deltaSec) {
        if (this.holdTimer > 0) {
            this.holdTimer -= deltaSec;
            if (this.holdTimer <= 0) {
                this.playAnim(this.isGF ? 'idleleft' : 'idle');
            }
        }

        this.frameTimer += deltaSec;
        if (this.frameTimer >= (1 / this.fps)) {
            this.frameTimer = 0;
            this.frame++;

            const symName = this.animMap[this.currentAnim];
            const sym = this.symbols[symName];
            if (sym) {
                let maxFrames = 1;
                for (const layer of sym.TL.L || []) {
                    for (const fr of layer.FR || []) {
                        maxFrames = Math.max(maxFrames, fr.I + fr.DU);
                    }
                }

                if (this.frame >= maxFrames) {
                    this.frame = (this.currentAnim.includes('idle')) ? 0 : maxFrames - 1;
                }
            }

            this.renderCurrentFrame();
        }
    }
}

// ----------------------------------------------------------------------------
// 3. FALLBACK RIG
// ----------------------------------------------------------------------------
function createFallbackCharacter(colorHex, isPlayer) {
    const cont = new PIXI.Container();
    const g = new PIXI.Graphics();
    
    g.beginFill(colorHex, 0.8);
    g.drawRoundedRect(isPlayer ? 35 : -95, -180, 60, 110, 16);
    g.endFill();

    g.beginFill(colorHex);
    g.drawRoundedRect(-60, -220, 120, 220, 45);
    g.endFill();

    g.beginFill(0x80dfff);
    g.drawRoundedRect(isPlayer ? -75 : 5, -170, 70, 45, 18);
    g.endFill();

    cont.addChild(g);
    return {
        container: cont,
        holdTimer: 0,
        playAnim: () => {
            cont.scale.set(1.08);
            setTimeout(() => cont.scale.set(1.0), 100);
        },
        update: () => {}
    };
}

// ----------------------------------------------------------------------------
// 4. UNIVERSAL CHARACTER LOADER (VERIFIED DIRECTORY PATH ENGINE)
// ----------------------------------------------------------------------------
async function loadCharacter(charName, isPlayer, isGF = false) {
    const clean = charName.toLowerCase().trim();

    let animJsonEntry = null;
    let spritemapJsonEntry = null;
    let spritemapPngEntry = null;

    // Scan for FlxAnimate Texture Atlas with literal folder hierarchies
    for (const [path, entry] of Object.entries(VirtualFS.assets)) {
        let isMatch = false;

        if (isGF) {
            isMatch = path.includes('characters/gf/cosmicube/') || path.includes('/gf/');
        } else if (isPlayer) {
            if (clean.includes('pico')) {
                isMatch = path.includes('characters/pico/cosmicube/') || path.includes('/pico/');
            } else {
                isMatch = path.includes('characters/bf/cosmicube/') || path.includes('/bf/');
            }
        } else {
            // Opponents live in dlc/ or triple/ or base characters/
            isMatch = path.includes(`characters/dlc/${clean}/`) || 
                      path.includes(`characters/triple/${clean}/`) || 
                      path.includes(`characters/triple/maroon/${clean}/`) ||
                      path.includes(`characters/${clean}/`) || 
                      path.includes(`/${clean}/`);
        }

        if (isMatch) {
            if (path.endsWith('animation.json')) animJsonEntry = entry;
            if (path.endsWith('spritemap1.json')) spritemapJsonEntry = entry;
            if (path.endsWith('spritemap1.png')) spritemapPngEntry = entry;
        }
    }

    if (animJsonEntry && spritemapJsonEntry && spritemapPngEntry) {
        try {
            const animText = sanitizeJsonText(await animJsonEntry.async('string'));
            const spritemapText = sanitizeJsonText(await spritemapJsonEntry.async('string'));

            const animJson = JSON.parse(animText);
            const spritemapJson = JSON.parse(spritemapText);
            const pngBlob = await spritemapPngEntry.async('blob');

            const img = new Image();
            img.src = URL.createObjectURL(pngBlob);
            await new Promise(res => img.onload = res);

            const baseTexture = new PIXI.BaseTexture(img);
            console.log(`%c[TEXTURE ATLAS LOADED] ${charName.toUpperCase()}`, "color: #00d2d3; font-weight: bold;");
            
            return new DynamicAtlasCharacter(baseTexture, animJson, spritemapJson, charName, isPlayer, isGF);
        } catch(err) {
            console.warn(`Failed loading Texture Atlas for ${charName}:`, err);
        }
    }

    // Sparrow Sheet Check (e.g. Detective, Base characters)
    let pngEntry = null;
    let xmlEntry = null;

    for (const [path, entry] of Object.entries(VirtualFS.assets)) {
        if (!path.includes('/dialogue/') && !path.includes('/cutscene/')) {
            if (path.endsWith(`${clean}.png`) || path.includes(`characters/dlc/${clean}/${clean}.png`)) pngEntry = entry;
            if (path.endsWith(`${clean}.xml`) || path.includes(`characters/dlc/${clean}/${clean}.xml`)) xmlEntry = entry;
        }
    }

    if (pngEntry && xmlEntry) {
        try {
            const pngBlob = await pngEntry.async('blob');
            const xmlText = (await xmlEntry.async('string')).replace(/^\uFEFF/, '').trim();

            const img = new Image();
            img.src = URL.createObjectURL(pngBlob);
            await new Promise(res => img.onload = res);

            const baseTexture = new PIXI.BaseTexture(img);
            const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');
            const anims = parseSparrowAtlas(baseTexture, xmlDoc);

            const charConfig = VirtualFS.charJsons[clean] || {};
            console.log(`%c[SPARROW SHEET LOADED] ${charName.toUpperCase()}`, "color: #2ed573; font-weight: bold;");
            return new SparrowCharacter(baseTexture, anims, charConfig, isPlayer);
        } catch(e) {
            console.error(`Failed to build Sparrow Character for ${charName}:`, e);
        }
    }

    return createFallbackCharacter(isPlayer ? 0x00d2d3 : (isGF ? 0xa55eea : 0xff334b), isPlayer);
}
