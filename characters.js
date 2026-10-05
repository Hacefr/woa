// ============================================================================
// CHARACTERS.JS - UNIVERSAL DUAL-ENGINE (GROUNDED STAGE ALIGNMENT)
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
// 1. SPARROW CHARACTER RUNTIME
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
// 2. DYNAMIC TEXTURE ATLAS ENGINE
// ----------------------------------------------------------------------------
class DynamicAtlasCharacter {
    constructor(baseTexture, animJson, spritemapJson, charName = '', isPlayer = false, isGF = false) {
        this.charName = charName.toLowerCase();
        this.isPlayer = isPlayer;
        this.isGF = isGF;
        this.isPico = this.charName.includes('pico');
        this.isDetective = this.charName.includes('detective');
        this.isHorse = this.charName.includes('horse');
        this.isNoob = this.charName.includes('noob');
        
        this.container = new PIXI.Container();
        this.displayContainer = new PIXI.Container();
        this.container.addChild(this.displayContainer);

        // 1. Spritemap Lookup
        this.spritemap = {};
        for (const item of spritemapJson.ATLAS.SPRITES) {
            const s = item.SPRITE;
            this.spritemap[s.name] = new PIXI.Texture(baseTexture, new PIXI.Rectangle(s.x, s.y, s.w, s.h));
        }

        // 2. Symbols Library
        this.symbols = {};
        if (animJson.SD && animJson.SD.S) {
            for (const s of animJson.SD.S) {
                this.symbols[s.SN] = s;
            }
        }

        // 3. Scan Master Timeline (AN.TL.L) for Frame Labels
        this.timelineAnims = {};
        this.masterLayers = (animJson.AN && animJson.AN.TL && animJson.AN.TL.L) ? animJson.AN.TL.L : [];

        for (const layer of this.masterLayers) {
            for (const fr of layer.FR || []) {
                if (fr.N) {
                    const label = fr.N.toLowerCase().trim();
                    this.timelineAnims[label] = {
                        startFrame: fr.I,
                        duration: fr.DU || 1
                    };
                }
            }
        }

        // 4. Scan Symbols for Direct Animation Names
        this.symbolAnims = {};
        for (const symName of Object.keys(this.symbols)) {
            const lower = symName.toLowerCase();
            const assign = (key) => {
                this.symbolAnims[key] = symName;
            };

            if (this.isGF) {
                if (lower.includes('idle1') || lower.includes('idleleft')) assign('idleleft');
                if (lower.includes('idle2') || lower.includes('idleright')) assign('idleright');
            } else {
                if (lower.includes('idle') && !this.symbolAnims['idle']) assign('idle');
                if (lower.includes('left') && !lower.includes('miss') && !this.symbolAnims['left']) { assign('left'); assign('singleft'); }
                if (lower.includes('down') && !lower.includes('miss') && !this.symbolAnims['down']) { assign('down'); assign('singdown'); }
                if (lower.includes('up') && !lower.includes('miss') && !this.symbolAnims['up']) { assign('up'); assign('singup'); }
                if (lower.includes('right') && !lower.includes('miss') && !this.symbolAnims['right']) { assign('right'); assign('singright'); }

                if (lower.includes('lock in')) assign('lock in');
                if (lower.includes('cock')) assign('cock');
                if (lower.includes('blast')) assign('blast');
            }
        }

        this.hasTimelineLabels = Object.keys(this.timelineAnims).length > 0;
        this.currentAnim = this.isGF ? 'idleleft' : 'idle';
        this.frame = 0;
        this.frameTimer = 0;
        this.holdTimer = 0;
        this.fps = 24;

        this.container.scale.set(1.0, 1.0);
        this.playAnim(this.currentAnim, true);
    }

    playAnim(animName, forced = false) {
        const clean = animName.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        let targetTimelineKey = Object.keys(this.timelineAnims).find(k => {
            const kc = k.replace(/[^a-z0-9]/g, '');
            return kc === clean || kc.startsWith(clean) || clean.startsWith(kc);
        });

        if (!targetTimelineKey && animName.includes('idle')) {
            targetTimelineKey = Object.keys(this.timelineAnims).find(k => k.includes('idle'));
        }

        if (targetTimelineKey) {
            this.mode = 'timeline';
            this.currentAnim = targetTimelineKey;
            this.activeAnimData = this.timelineAnims[targetTimelineKey];
            this.frame = 0;
            this.frameTimer = 0;
            if (!targetTimelineKey.includes('idle')) this.holdTimer = 0.35;
            this.renderCurrentFrame();
            return;
        }

        let targetSymbolKey = Object.keys(this.symbolAnims).find(k => k === clean || clean.includes(k));
        if (!targetSymbolKey && animName.includes('idle')) targetSymbolKey = this.isGF ? 'idleleft' : 'idle';

        if (targetSymbolKey && this.symbolAnims[targetSymbolKey]) {
            this.mode = 'symbol';
            this.currentAnim = targetSymbolKey;
            this.activeSymbolName = this.symbolAnims[targetSymbolKey];
            this.frame = 0;
            this.frameTimer = 0;
            if (!targetSymbolKey.includes('idle')) this.holdTimer = 0.35;
            this.renderCurrentFrame();
        }
    }

    renderCurrentFrame() {
        this.displayContainer.removeChildren();
        const self = this;

        function renderSymbolInstance(symName, frameNum, parentMat, target) {
            const sym = self.symbols[symName];
            if (!sym || !sym.TL || !sym.TL.L) return;

            for (let l = sym.TL.L.length - 1; l >= 0; l--) {
                const layer = sym.TL.L[l];
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
                        renderSymbolInstance(el.SI.SN, subFrame, finalMat, target);
                    }
                }
            }
        }

        // 1. TIMELINE MODE (Detective, Horsemate, Noob49)
        if (this.mode === 'timeline' && this.activeAnimData) {
            const masterFrame = this.activeAnimData.startFrame + this.frame;

            // Ground-level calibration: places feet on floor
            let groundOffsetX = 0;
            let groundOffsetY = -450; // Standard 500px character anchor

            if (this.isDetective) {
                groundOffsetX = 0;
                groundOffsetY = -480;
            } else if (this.isHorse) {
                groundOffsetX = 0;
                groundOffsetY = -400;
            } else if (this.isNoob) {
                groundOffsetX = 0;
                groundOffsetY = -220; // Noob sits low in foreground
            }

            for (let l = this.masterLayers.length - 1; l >= 0; l--) {
                const layer = this.masterLayers[l];
                if (!layer.FR) continue;

                let activeFR = null;
                for (const fr of layer.FR) {
                    if (masterFrame >= fr.I && masterFrame < fr.I + fr.DU) {
                        activeFR = fr;
                        break;
                    }
                }

                if (!activeFR || !activeFR.E) continue;

                for (const el of activeFR.E) {
                    const baseMat = new PIXI.Matrix();
                    baseMat.translate(groundOffsetX, groundOffsetY);

                    if (el.ASI) {
                        const tex = this.spritemap[el.ASI.N];
                        if (tex) {
                            const spr = new PIXI.Sprite(tex);
                            spr.transform.setFromMatrix(baseMat.append(extractMatrix(el.ASI)));
                            this.displayContainer.addChild(spr);
                        }
                    } else if (el.SI) {
                        let subFrame = 0;
                        if (el.SI.LP === "SF") {
                            subFrame = el.SI.FF || 0;
                        } else {
                            subFrame = (masterFrame - activeFR.I + (el.SI.FF || 0));
                        }
                        const localMat = extractMatrix(el.SI);
                        const finalMat = baseMat.clone().append(localMat);
                        renderSymbolInstance(el.SI.SN, subFrame, finalMat, this.displayContainer);
                    }
                }
            }
            return;
        }

        // 2. SYMBOL MODE (Boyfriend, Pico, Girlfriend)
        if (this.mode === 'symbol' && this.activeSymbolName) {
            const rootMat = new PIXI.Matrix();
            if (this.isPico) {
                rootMat.translate(116, -180);
            } else if (this.isPlayer) {
                rootMat.translate(-405, -280);
            } else if (this.isGF) {
                rootMat.translate(-350, -320);
            } else {
                rootMat.translate(-200, -320);
            }
            renderSymbolInstance(this.activeSymbolName, this.frame, rootMat, this.displayContainer);
        }
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

            if (this.mode === 'timeline' && this.activeAnimData) {
                if (this.frame >= this.activeAnimData.duration) {
                    this.frame = (this.currentAnim.includes('idle')) ? 0 : this.activeAnimData.duration - 1;
                }
            } else if (this.mode === 'symbol' && this.activeSymbolName) {
                const sym = this.symbols[this.activeSymbolName];
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
// 4. UNIVERSAL CHARACTER LOADER
// ----------------------------------------------------------------------------
async function loadCharacter(charName, isPlayer, isGF = false) {
    const clean = charName.toLowerCase().trim();

    let animJsonEntry = null;
    let spritemapJsonEntry = null;
    let spritemapPngEntry = null;

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

    // Sparrow Sheet Check (Fallback)
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
