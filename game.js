// ============================================================================
// GAME.JS - FULL-TAB RESPONSIVE RUNNER, ZERO-LEAK CLEANUP & FREEZE PROTECTION
// ============================================================================

const NOTE_COLORS = [0xc24b99, 0x00ffff, 0x12fa05, 0xf9393f]; 
const ARROW_ANGLES = [-Math.PI / 2, Math.PI, 0, Math.PI / 2];

function drawArrowShape(graphics, color, size = 32) {
    graphics.clear();
    graphics.beginFill(color);
    graphics.moveTo(0, -size);
    graphics.lineTo(size * 0.8, size * 0.7);
    graphics.lineTo(0, size * 0.4);
    graphics.lineTo(-size * 0.8, size * 0.7);
    graphics.closePath();
    graphics.endFill();
}

let playState = null;
let activeCountdownTimer = null;

class PlayStateScene {
    constructor(songItem, dadChar, bfChar, gfChar, stageData, stageProps, stageJson, extraChars = {}) {
        this.songItem = songItem;
        this.speed = songItem.speed || 2.5;

        this.worldContainer = new PIXI.Container();
        this.hudContainer = new PIXI.Container();

        this.dad = dadChar;
        this.bf = bfChar;
        this.gf = gfChar;
        this.extraChars = extraChars;

        this.notes = [];
        this.events = [];
        this.receptors = [];
        this.score = 0;
        this.combo = 0;
        this.misses = 0;
        this.totalNotesHit = 0;
        this.totalNotesPossible = 0;
        this.health = 1.0;

        this.gfDanceLeft = false;
        this.props = {};

        // Base Stage Zoom
        this.camZoom = (stageJson && stageJson.cameraZoom) ? stageJson.cameraZoom : 0.7;
        this.baseZoom = this.camZoom;

        // Stage camera anchors
        this.initStageCameras(songItem.id.toLowerCase());

        this.setupStage(stageData, stageProps, stageJson);
        this.setupCharacters(stageJson);
        this.setupStrumlines();
        this.parseChartNotes(songItem.chartData);
        this.setupHUD();

        app.stage.addChild(this.worldContainer);
        app.stage.addChild(this.hudContainer);
    }

    initStageCameras(songId) {
        if (songId.includes('49')) {
            this.dadCam = [500, 480];
            this.bfCam = [850, 480];
            this.camTargetX = 675;
            this.camTargetY = 480;
        } else if (songId.includes('suspect')) {
            this.dadCam = [500, 450];
            this.bfCam = [850, 450];
            this.camTargetX = 675;
            this.camTargetY = 450;
        } else if (songId.includes('trot')) {
            this.dadCam = [540, 400];
            this.bfCam = [900, 400];
            this.camTargetX = 720;
            this.camTargetY = 400;
        } else if (songId.includes('lied')) {
            this.dadCam = [640, 480];
            this.bfCam = [810, 480];
            this.camTargetX = 725;
            this.camTargetY = 480;
        } else if (songId.includes('threat')) {
            this.dadCam = [800, 520];
            this.bfCam = [1050, 520];
            this.camTargetX = 925;
            this.camTargetY = 520;
            this.baseZoom = 0.58;
            this.camZoom = 0.58;
        } else {
            this.dadCam = [600, 480];
            this.bfCam = [850, 480];
            this.camTargetX = 725;
            this.camTargetY = 480;
        }

        this.camFocusX = this.camTargetX;
        this.camFocusY = this.camTargetY;
    }

    setupStage(stageData, stageProps, stageJson) {
        this.stageBack = new PIXI.Container();
        this.stageFront = new PIXI.Container();

        if (stageJson && stageJson.props) {
            stageJson.props.forEach(p => {
                const cleanName = p.assetPath.split('/').pop().toLowerCase();
                const tex = stageData[cleanName];

                if (p.assetPath && p.assetPath.startsWith('#')) {
                    const g = new PIXI.Graphics();
                    const hexColor = parseInt(p.assetPath.replace('#', '0x'), 16) || 0x000000;
                    g.beginFill(hexColor);
                    g.drawRect(-4000, -4000, 10000, 10000);
                    g.endFill();
                    
                    g.alpha = 0;
                    if (p.blend === 'multiply') g.blendMode = PIXI.BLEND_MODES.MULTIPLY;
                    if (p.blend === 'subtract') g.blendMode = PIXI.BLEND_MODES.SUBTRACT;
                    if (p.blend === 'add') g.blendMode = PIXI.BLEND_MODES.ADD;
                    g.zIndex = p.zIndex || 0;

                    const propName = p.name ? p.name.toLowerCase() : cleanName;
                    this.props[propName] = g;

                    if (p.zIndex >= 300) this.stageFront.addChild(g);
                    else this.stageBack.addChild(g);
                    return;
                }

                if (stageProps[cleanName]) {
                    const animTextures = Object.values(stageProps[cleanName])[0];
                    const aSpr = new PIXI.AnimatedSprite(animTextures);
                    aSpr.position.set(p.position[0], p.position[1]);
                    aSpr.scale.set(p.scale || 1);
                    aSpr.zIndex = p.zIndex || 0;
                    aSpr.alpha = (p.alpha !== undefined) ? p.alpha : 1;
                    aSpr.loop = false;
                    aSpr.animationSpeed = 24 / 60;

                    this.stageBack.addChild(aSpr);

                    const propName = p.name ? p.name.toLowerCase() : cleanName;
                    this.props[propName] = aSpr;
                    this.props[cleanName] = aSpr;
                } else if (tex) {
                    const spr = new PIXI.Sprite(tex);
                    spr.position.set(p.position[0], p.position[1]);
                    
                    const isBackdrop = (cleanName === 'bg' || cleanName === 'sky' || cleanName === 'wall');
                    const propScale = p.scale || 1;
                    spr.scale.set(isBackdrop ? propScale * 1.3 : propScale);

                    spr.alpha = (p.alpha !== undefined) ? p.alpha : 1;
                    if (p.blend === 'subtract') spr.blendMode = PIXI.BLEND_MODES.SUBTRACT;
                    if (p.blend === 'add') spr.blendMode = PIXI.BLEND_MODES.ADD;
                    spr.zIndex = p.zIndex || 0;

                    const propName = p.name ? p.name.toLowerCase() : cleanName;
                    this.props[propName] = spr;
                    this.props[cleanName] = spr;

                    if (p.zIndex >= 300) {
                        this.stageFront.addChild(spr);
                    } else {
                        this.stageBack.addChild(spr);
                    }
                }
            });

            this.stageBack.sortChildren();
            this.stageFront.sortChildren();
        }

        this.worldContainer.addChild(this.stageBack);
    }

    setupCharacters(stageJson) {
        const c = (stageJson && stageJson.characters) ? stageJson.characters : null;

        let dadPos = [100, 100];
        let bfPos = [770, 450];
        let gfPos = [400, 130];

        if (c) {
            if (c.dad && Array.isArray(c.dad.position)) dadPos = c.dad.position;
            if (c.bf && Array.isArray(c.bf.position)) bfPos = c.bf.position;
            if (c.gf && Array.isArray(c.gf.position)) gfPos = c.gf.position;
        }

        if (this.dad) this.dad.container.position.set(dadPos[0], dadPos[1]);
        if (this.bf) this.bf.container.position.set(bfPos[0], bfPos[1]);
        
        if (this.gf) {
            this.gf.container.position.set(gfPos[0], gfPos[1]);
            if (c && c.gf && c.gf.scale) this.gf.container.scale.set(c.gf.scale);
            this.gf.container.visible = !!(c && c.gf);
        }

        if (this.gf && this.gf.container.visible) this.worldContainer.addChild(this.gf.container);
        if (this.dad) this.worldContainer.addChild(this.dad.container);
        if (this.bf) this.worldContainer.addChild(this.bf.container);

        if (this.extraChars.maroon) {
            this.extraChars.maroon.container.position.set(dadPos[0] - 150, dadPos[1]);
            this.extraChars.maroon.container.visible = false;
            this.worldContainer.addChild(this.extraChars.maroon.container);
        }
        if (this.extraChars.grey) {
            this.extraChars.grey.container.position.set(dadPos[0] - 300, dadPos[1]);
            this.extraChars.grey.container.visible = false;
            this.worldContainer.addChild(this.extraChars.grey.container);
        }
        if (this.extraChars.maroonParasite) {
            this.extraChars.maroonParasite.container.position.set(dadPos[0] - 180, dadPos[1]);
            this.extraChars.maroonParasite.container.visible = false;
            this.worldContainer.addChild(this.extraChars.maroonParasite.container);
        }

        this.worldContainer.addChild(this.stageFront);
    }

    setupStrumlines() {
        const startX_Opponent = 96;
        const startX_Player = 1280 - 96 - (4 * 110);
        const receptorY = 85;
        const spacing = 110;

        for (let i = 0; i < 8; i++) {
            const isPlayer = i >= 4;
            const dir = i % 4;
            const x = (isPlayer ? startX_Player : startX_Opponent) + (dir * spacing);

            const receptor = new PIXI.Container();
            receptor.position.set(x, receptorY);

            const base = new PIXI.Graphics();
            base.lineStyle(4, 0x3d4457, 1);
            base.drawCircle(0, 0, 42);
            receptor.addChild(base);

            const arrow = new PIXI.Graphics();
            drawArrowShape(arrow, 0x8a95aa, 28);
            arrow.rotation = ARROW_ANGLES[dir];
            receptor.addChild(arrow);

            this.receptors.push({ container: receptor, dir, isPlayer, arrow, base });
            this.hudContainer.addChild(receptor);
        }
    }

    parseChartNotes(chart) {
        this.notes = [];
        this.events = [];
        if (!chart) return;

        const data = chart.chartData || chart;
        const songObj = (data.song && typeof data.song === 'object') ? data.song : data;

        if (data.events && Array.isArray(data.events)) {
            data.events.forEach(evt => {
                if (evt.t !== undefined) {
                    this.events.push({
                        time: evt.t,
                        name: evt.e,
                        val: evt.v,
                        fired: false
                    });
                }
            });
            this.events.sort((a, b) => a.time - b.time);
        }

        if (data.notes && typeof data.notes === 'object' && !Array.isArray(data.notes)) {
            const diffNotes = data.notes.hard || data.notes.normal || data.notes.default || Object.values(data.notes)[0];
            if (Array.isArray(diffNotes)) {
                diffNotes.forEach(n => {
                    const rawDir = n.d !== undefined ? n.d : (n.dir || 0);
                    this.notes.push({
                        time: n.t !== undefined ? n.t : n.time,
                        dir: rawDir % 4,
                        isPlayer: (rawDir < 4),
                        kind: n.k || '',
                        sustain: n.l !== undefined ? n.l : (n.sLen || 0),
                        hit: false, missed: false, sprite: null, tailSprite: null
                    });
                });
            }
        }

        this.notes.sort((a, b) => a.time - b.time);

        this.notes.forEach(n => {
            const spr = new PIXI.Graphics();
            drawArrowShape(spr, NOTE_COLORS[n.dir], 32);
            spr.rotation = ARROW_ANGLES[n.dir];
            spr.visible = false;
            this.hudContainer.addChild(spr);
            n.sprite = spr;

            if (n.sustain > 50) {
                const tail = new PIXI.Graphics();
                tail.visible = false;
                this.hudContainer.addChildAt(tail, 0);
                n.tailSprite = tail;
            }
        });
    }

    setupHUD() {
        this.healthBarCont = new PIXI.Container();
        this.healthBarCont.position.set(640, 660); // Lowered slightly so it never blocks characters' feet

        const barWidth = 600;
        const barHeight = 16;
        this.barWidth = barWidth;
        this.barHeight = barHeight;

        this.barBorder = new PIXI.Graphics();
        this.barBorder.beginFill(0x000000);
        this.barBorder.drawRect(-barWidth / 2 - 4, -barHeight / 2 - 4, barWidth + 8, barHeight + 8);
        this.barBorder.endFill();
        this.healthBarCont.addChild(this.barBorder);

        this.barFill = new PIXI.Graphics();
        this.healthBarCont.addChild(this.barFill);

        this.dadIcon = this.createCharacterIcon(0x2f3542, false);
        this.bfIcon = this.createCharacterIcon(0x31b0d5, true);

        this.healthBarCont.addChild(this.dadIcon);
        this.healthBarCont.addChild(this.bfIcon);

        this.hudContainer.addChild(this.healthBarCont);

        this.scoreText = new PIXI.Text('Score: 0 | Misses: 0 | Accuracy: ?', {
            fontFamily: 'Segoe UI, sans-serif',
            fontSize: 16,
            fontWeight: 'bold',
            fill: 0xffffff,
            align: 'center'
        });
        this.scoreText.anchor.set(0.5);
        this.scoreText.position.set(640, 690);
        this.hudContainer.addChild(this.scoreText);

        this.ratingText = new PIXI.Text('READY!', {
            fontFamily: 'Segoe UI, sans-serif',
            fontSize: 48,
            fontWeight: 'bold',
            fill: 0x00d2d3,
            align: 'center'
        });
        this.ratingText.anchor.set(0.5);
        this.ratingText.position.set(1280 / 2, 350);
        this.hudContainer.addChild(this.ratingText);

        this.updateHealthBar();
    }

    createCharacterIcon(colorHex, isBF) {
        const cont = new PIXI.Container();
        const g = new PIXI.Graphics();

        if (isBF) {
            g.beginFill(0x31b0d5);
            g.drawCircle(0, 0, 26);
            g.endFill();

            g.beginFill(0xe55039);
            g.drawRoundedRect(-14, -26, 38, 24, 8);
            g.endFill();

            g.beginFill(0xf6b93b);
            g.drawRoundedRect(-12, -4, 28, 22, 6);
            g.endFill();
        } else {
            g.beginFill(colorHex);
            g.drawRoundedRect(-22, -22, 44, 44, 16);
            g.endFill();

            g.beginFill(0x80dfff);
            g.drawRoundedRect(-6, -14, 28, 18, 8);
            g.endFill();

            g.beginFill(0x1e272e);
            g.drawRect(-26, -26, 52, 8);
            g.drawRoundedRect(-18, -36, 36, 14, 4);
            g.endFill();
        }

        cont.addChild(g);
        cont.baseScale = 1.0;
        return cont;
    }

    updateHealthBar() {
        const bw = this.barWidth;
        const bh = this.barHeight;
        const pct = Math.max(0, Math.min(2.0, this.health)) / 2.0;

        this.barFill.clear();
        this.barFill.beginFill(0x2f3542);
        this.barFill.drawRect(-bw / 2, -bh / 2, bw, bh);
        this.barFill.endFill();

        const bfWidth = bw * pct;
        this.barFill.beginFill(0x31b0d5);
        this.barFill.drawRect(bw / 2 - bfWidth, -bh / 2, bfWidth, bh);
        this.barFill.endFill();

        const splitX = (bw / 2 - bfWidth);
        this.dadIcon.position.set(splitX - 35, 0);
        this.bfIcon.position.set(splitX + 35, 0);
    }

    triggerEvent(e) {
        const name = e.name;
        const val = e.val || {};

        switch(name) {
            case 'FocusCamera':
                if (val.char === 1) {
                    this.camTargetX = this.dadCam[0];
                    this.camTargetY = this.dadCam[1];
                } else if (val.char === 0) {
                    this.camTargetX = this.bfCam[0];
                    this.camTargetY = this.bfCam[1];
                } else if (val.char === -1 && val.x !== undefined && val.y !== undefined) {
                    this.camTargetX = val.x;
                    this.camTargetY = val.y;
                }
                break;

            case 'ClassicCameraZoom':
            case 'ZoomCamera':
                if (val.zoom !== undefined) {
                    this.baseZoom = val.zoom;
                }
                break;

            case 'ChangeSuffix':
                if (val.char === 'dad' && this.dad) this.dad.idleSuffix = val.suffix || '';
                if (val.char === 'bf' && this.bf) this.bf.idleSuffix = val.suffix || '';
                break;

            case 'ReactorBeep':
                if (this.props['blooodfuckkk']) {
                    this.props['blooodfuckkk'].alpha = 0.4;
                    setTimeout(() => { if (this.props['blooodfuckkk']) this.props['blooodfuckkk'].alpha = 0; }, 150);
                }
                break;

            case 'PlayAnimation':
                if (val.target === 'dad' && this.dad) this.dad.playAnim(val.anim, true);
                if (val.target === 'bf' && this.bf) this.bf.playAnim(val.anim, true);
                break;
        }
    }

    update(deltaSec) {
        const songPos = Conductor.songPosition;
        const receptorY = 85;
        const scrollMult = 0.32 * this.speed;

        if (this.dad) this.dad.update(deltaSec);
        if (this.bf) this.bf.update(deltaSec);
        if (this.gf && this.gf.container.visible) this.gf.update(deltaSec);

        if (this.extraChars.maroon && this.extraChars.maroon.container.visible) this.extraChars.maroon.update(deltaSec);
        if (this.extraChars.grey && this.extraChars.grey.container.visible) this.extraChars.grey.update(deltaSec);
        if (this.extraChars.maroonParasite && this.extraChars.maroonParasite.container.visible) this.extraChars.maroonParasite.update(deltaSec);

        for (let i = 0; i < this.events.length; i++) {
            const e = this.events[i];
            if (!e.fired && songPos >= e.time) {
                e.fired = true;
                this.triggerEvent(e);
            }
        }

        // Camera Lerp
        this.camFocusX += (this.camTargetX - this.camFocusX) * 0.05;
        this.camFocusY += (this.camTargetY - this.camFocusY) * 0.05;
        this.camZoom += (this.baseZoom - this.camZoom) * 0.08;

        this.worldContainer.scale.set(this.camZoom);
        this.worldContainer.pivot.set(this.camFocusX, this.camFocusY);
        this.worldContainer.position.set(640, 360);

        this.receptors.forEach(r => {
            r.container.scale.x += (1.0 - r.container.scale.x) * 0.2;
            r.container.scale.y += (1.0 - r.container.scale.y) * 0.2;
        });

        for (let i = 0; i < this.notes.length; i++) {
            const n = this.notes[i];
            if (n.hit || n.missed) continue;

            const diff = n.time - songPos;

            // Opponent note hit
            if (!n.isPlayer && diff <= 0) {
                n.hit = true;
                n.sprite.visible = false;
                if (n.tailSprite) n.tailSprite.visible = false;
                this.hitReceptor(n.dir, false);

                const anims = ['left', 'down', 'up', 'right'];
                const animToPlay = anims[n.dir];

                if (n.kind === 'maroon' && this.extraChars.maroon && this.extraChars.maroon.container.visible) {
                    this.extraChars.maroon.playAnim(animToPlay, true);
                } else if (n.kind === 'grey' && this.extraChars.grey && this.extraChars.grey.container.visible) {
                    this.extraChars.grey.playAnim(animToPlay, true);
                } else if (n.kind === 'maroonP' && this.extraChars.maroonParasite && this.extraChars.maroonParasite.container.visible) {
                    this.extraChars.maroonParasite.playAnim(animToPlay, true);
                } else if (this.dad) {
                    const suffix = this.dad.idleSuffix || '';
                    this.dad.playAnim(animToPlay + suffix, true);
                }
                continue;
            }

            // Player note miss
            if (n.isPlayer && diff < -150) {
                n.missed = true;
                n.sprite.visible = false;
                if (n.tailSprite) n.tailSprite.visible = false;
                this.combo = 0;
                this.misses++;
                this.health = Math.max(0.0, this.health - 0.09);
                this.score = Math.max(0, this.score - 100);

                this.showRating("MISS", 0xff334b);
                this.updateScore();
                this.updateHealthBar();

                const missAnims = ['singleftmiss', 'singdownmiss', 'singupmiss', 'singrightmiss'];
                if (this.bf) this.bf.playAnim(missAnims[n.dir] || 'singleftmiss', true);
                continue;
            }

            // Draw note
            if (diff > -200 && diff < 1600) {
                const targetReceptor = this.receptors[n.isPlayer ? n.dir + 4 : n.dir];
                const noteY = receptorY + (diff * scrollMult);

                n.sprite.position.set(targetReceptor.container.x, noteY);
                n.sprite.visible = true;

                if (n.tailSprite) {
                    const tailHeight = n.sustain * scrollMult;
                    n.tailSprite.clear();
                    n.tailSprite.beginFill(NOTE_COLORS[n.dir], 0.6);
                    n.tailSprite.drawRect(-8, 0, 16, tailHeight);
                    n.tailSprite.endFill();
                    n.tailSprite.position.set(targetReceptor.container.x, noteY);
                    n.tailSprite.visible = true;
                }
            } else {
                n.sprite.visible = false;
                if (n.tailSprite) n.tailSprite.visible = false;
            }
        }
    }

    hitReceptor(dir, isPlayer) {
        const r = this.receptors[isPlayer ? dir + 4 : dir];
        r.container.scale.set(1.22);
        drawArrowShape(r.arrow, NOTE_COLORS[dir], 32);
        setTimeout(() => {
            drawArrowShape(r.arrow, 0x8a95aa, 28);
        }, 110);
    }

    onKeyPress(dir) {
        const songPos = Conductor.songPosition;
        this.hitReceptor(dir, true);
        
        const anims = ['left', 'down', 'up', 'right'];
        if (this.bf) {
            this.bf.playAnim(anims[dir], true);
        }

        let closest = null;
        let minDiff = Infinity;

        for (let i = 0; i < this.notes.length; i++) {
            const n = this.notes[i];
            if (n.isPlayer && n.dir === dir && !n.hit && !n.missed) {
                const diff = Math.abs(n.time - songPos);
                if (diff < minDiff && diff <= 150) {
                    minDiff = diff;
                    closest = n;
                }
            }
        }

        if (closest) {
            closest.hit = true;
            closest.sprite.visible = false;
            if (closest.tailSprite) closest.tailSprite.visible = false;
            this.combo++;
            this.totalNotesHit++;
            this.totalNotesPossible++;
            this.health = Math.min(2.0, this.health + 0.045);

            if (minDiff <= 22.5) {
                this.score += 400;
                this.showRating("EPIC!", 0x66fcf1);
            } else if (minDiff <= 45) {
                this.score += 350;
                this.showRating("SICK!", 0x00d2d3);
            } else if (minDiff <= 90) {
                this.score += 200;
                this.showRating("GOOD", 0x2ed573);
            } else {
                this.score += 50;
                this.showRating("BAD", 0xffa502);
            }

            this.updateScore();
            this.updateHealthBar();
        }
    }

    showRating(text, color) {
        this.ratingText.text = text;
        this.ratingText.style.fill = color;
        this.ratingText.scale.set(1.35);
    }

    updateScore() {
        const acc = this.totalNotesPossible > 0 ? ((this.totalNotesHit / this.totalNotesPossible) * 100).toFixed(1) : '100';
        this.scoreText.text = `Score: ${this.score} | Misses: ${this.misses} | Accuracy: ${acc}%`;
    }

    // COMPLETE VRAM & TEXTURE CACHE PURGE
    destroy() {
        app.stage.removeChild(this.worldContainer);
        app.stage.removeChild(this.hudContainer);

        this.notes = [];
        this.events = [];
        this.receptors = [];
        this.props = {};

        this.worldContainer.destroy({ children: true, texture: true, baseTexture: true });
        this.hudContainer.destroy({ children: true });

        // Purge Pixi's global WebGL texture registry so GPU memory resets to 0MB
        PIXI.utils.clearTextureCache();
    }
}

// ============================================================================
// OFFICIAL HXC STAGE DIRECTORS (FRAME-DROP SAFE RANGE CHECKS)
// ============================================================================
function onStepHit(step) {
    if (!playState) return;
    const currentSong = playState.songItem.id.toLowerCase();

    // 1. "49"
    if (currentSong.includes('49')) {
        if (step >= 993) {
            if (playState.props['graypet']) playState.props['graypet'].alpha = 0.001;
            if (playState.props['tawny']) playState.props['tawny'].alpha = 0.001;
            if (playState.props['deadtawny']) playState.props['deadtawny'].alpha = 1;
            playState.dadCam = [270, 480];
        }
    }

    // 2. "Suspect" (Frame-drop safe: using range checks so skipped frames never lock screen)
    if (currentSong.includes('suspect')) {
        if (step >= 48 && step < 64) {
            if (playState.props['loblack']) playState.props['loblack'].alpha = 0.8;
            playState.hudContainer.visible = false;
        }
        if (step >= 60 && step < 64) {
            if (playState.props['discuss']) playState.props['discuss'].alpha = 1;
        }
        if (step >= 64) {
            if (playState.props['discuss']) playState.props['discuss'].alpha = 0;
            if (playState.props['loblack']) playState.props['loblack'].alpha = 0;
            playState.hudContainer.visible = true;
        }

        // Pico shooting events
        if (step === 805) {
            if (playState.bf) playState.bf.playAnim('lock in', true);
            if (playState.props['player']) playState.props['player'].playAnimation('die', true);
        }
        if (step === 812) {
            if (playState.bf) playState.bf.playAnim('cock', true);
            if (playState.dad) playState.dad.playAnim('singRIGHT', true);
        }
        if (step === 816) {
            if (playState.bf) playState.bf.playAnim('blast', true);
            if (playState.dad) playState.dad.playAnim('shock', true);
        }
    }

    // 3. "Trot Away"
    if (currentSong.includes('trot')) {
        if (step >= 840 && step < 1096) {
            if (playState.props['subtract']) playState.props['subtract'].alpha = 0.5;
        }
        if (step >= 1096) {
            if (playState.props['caught']) playState.props['caught'].alpha = 1;
            if (playState.props['subtract']) playState.props['subtract'].alpha = 0.11;
        }
    }

    // 4. "Don't Lied"
    if (currentSong.includes('lied')) {
        if (step >= 1184 && step < 1376) {
            if (playState.props['loblack']) playState.props['loblack'].alpha = 0.8;
        }
        if (step === 1232) {
            if (playState.dad) playState.dad.container.position.x = 690;
        }
        if (step >= 1376) {
            if (playState.props['loblack']) playState.props['loblack'].alpha = 0;
        }
        if (step === 1394) {
            if (playState.dad) playState.dad.playAnim('stab', true);
        }
        if (step === 1396) {
            if (playState.props['blooodfuckkk']) {
                playState.props['blooodfuckkk'].alpha = 0.8;
                setTimeout(() => { if (playState.props['blooodfuckkk']) playState.props['blooodfuckkk'].alpha = 0; }, 1200);
            }
            if (playState.gf) playState.gf.playAnim('sad', true);
        }
    }

    // 5. "Triple Threat"
    if (currentSong.includes('threat')) {
        if (step >= 240) {
            if (playState.extraChars.maroon) playState.extraChars.maroon.container.visible = true;
        }
        if (step >= 690) {
            if (playState.extraChars.grey) playState.extraChars.grey.container.visible = true;
        }
        if (step >= 1320) {
            if (playState.extraChars.maroon) playState.extraChars.maroon.container.visible = false;
            if (playState.extraChars.maroonParasite) playState.extraChars.maroonParasite.container.visible = true;
        }
    }
}

function onBeatHit(beat) {
    if (!playState) return;
    const currentSong = playState.songItem.id.toLowerCase();

    if (currentSong.includes('49')) {
        if (beat % 2 === 0 && playState.props['shit']) playState.props['shit'].gotoAndPlay(0);
        if (beat % 1 === 0) {
            if (playState.props['tawny']) playState.props['tawny'].gotoAndPlay(0);
            if (playState.props['graypet']) playState.props['graypet'].gotoAndPlay(0);
        }
    }

    if (currentSong.includes('trot') && beat % 2 === 0 && playState.props['caught']) {
        playState.props['caught'].gotoAndPlay(0);
    }

    if (playState.dadIcon) playState.dadIcon.scale.set(1.25);
    if (playState.bfIcon) playState.bfIcon.scale.set(1.25);

    if (playState.gf && playState.gf.container.visible) {
        playState.gfDanceLeft = !playState.gfDanceLeft;
        playState.gf.playAnim(playState.gfDanceLeft ? 'idleleft' : 'idleright', true);
    }

    if (playState.dad && playState.dad.holdTimer <= 0) playState.dad.playAnim('idle');
    if (playState.bf && playState.bf.holdTimer <= 0) playState.bf.playAnim('idle');

    if (playState.extraChars.maroon && playState.extraChars.maroon.holdTimer <= 0) playState.extraChars.maroon.playAnim('idle');
    if (playState.extraChars.grey && playState.extraChars.grey.holdTimer <= 0) playState.extraChars.grey.playAnim('idle');
    if (playState.extraChars.maroonParasite && playState.extraChars.maroonParasite.holdTimer <= 0) playState.extraChars.maroonParasite.playAnim('idle');

    playState.receptors.forEach(r => {
        r.container.scale.set(1.06);
    });
}

// Game loop ticker
app.ticker.add((delta) => {
    const deltaSec = delta / 60;
    Conductor.update();

    if (playState) {
        playState.update(deltaSec);
        if (playState.ratingText && playState.ratingText.scale.x > 1.0) {
            playState.ratingText.scale.x -= delta * 0.05;
            playState.ratingText.scale.y -= delta * 0.05;
        }
    }
});

// Keyboard Mapping
const KEY_MAP = {
    'KeyD': 0, 'ArrowLeft': 0,
    'KeyF': 1, 'ArrowDown': 1,
    'KeyJ': 2, 'ArrowUp': 2,
    'KeyK': 3, 'ArrowRight': 3
};

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        returnToFreeplay();
        return;
    }

    if (playState && KEY_MAP[e.code] !== undefined) {
        if (!e.repeat) {
            playState.onKeyPress(KEY_MAP[e.code]);
        }
    }
});

// ============================================================================
// STAGE & PROPS LOADER
// ============================================================================
async function loadAnimatedProp(stageFolder, propName) {
    let pngEntry = null;
    let xmlEntry = null;

    for (const [path, entry] of Object.entries(VirtualFS.assets)) {
        if (path.includes(`bg/${stageFolder}/`)) {
            if (path.endsWith(`${propName}.png`)) pngEntry = entry;
            if (path.endsWith(`${propName}.xml`)) xmlEntry = entry;
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
            return parseSparrowAtlas(baseTexture, xmlDoc);
        } catch(e) {}
    }
    return null;
}

// --- LAUNCH SONG ---
async function launchSong(item) {
    // Kill any pending countdown from a previous song immediately
    if (activeCountdownTimer) {
        clearTimeout(activeCountdownTimer);
        activeCountdownTimer = null;
    }

    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    freeplayScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    if (playState) {
        playState.destroy();
        playState = null;
    }

    const songId = item.id.toLowerCase();
    const cleanId = songId.replace(/[^a-z0-9]/g, '');

    const audioToLoad = [];

    for (const [path, entry] of Object.entries(VirtualFS.assets)) {
        const cleanPath = path.replace(/[^a-z0-9\/\.]/g, '');
        if (cleanPath.includes(`/${cleanId}/`) || cleanPath.includes(`songs/${cleanId}`) || cleanPath.includes(`/${cleanId}-inst`) || cleanPath.includes(`/${cleanId}-voices`)) {
            if (cleanPath.endsWith('.ogg')) {
                audioToLoad.push({ path, entry });
            }
        }
    }

    if (audioToLoad.length === 0) {
        alert(`No .ogg audio files found for song: ${item.name}`);
        returnToFreeplay();
        return;
    }

    Conductor.stop();
    Conductor.setBPM(item.bpm);

    try {
        for (const audioFile of audioToLoad) {
            const buffer = await audioFile.entry.async('arraybuffer');
            const decoded = await audioCtx.decodeAudioData(buffer.slice(0));

            const source = audioCtx.createBufferSource();
            source.buffer = decoded;
            source.connect(audioCtx.destination);

            Conductor.activeSources.push(source);
        }

        // 1. Load Main Characters
        const dadChar = await loadCharacter(item.player2, false, false);
        const bfChar = await loadCharacter(item.player1, true, false);
        const gfChar = await loadCharacter(item.id.includes('suspect') ? 'deadnoob49' : (item.id.includes('trot') ? 'gfweird-sheriff' : 'gfweird'), false, true);

        // 2. Extra Characters for Triple Threat
        const extraChars = {};
        if (cleanId.includes('threat')) {
            extraChars.maroon = await loadCharacter('maroonthreat', false, false);
            extraChars.grey = await loadCharacter('greythreat', false, false);
            extraChars.maroonParasite = await loadCharacter('maroonParasite', false, false);
        }

        // 3. Load Stage Dynamically
        const stageData = {};
        const stageFolder = (item.stage || 'security').toLowerCase().includes('sec') ? 'security' : (item.stage || 'security').toLowerCase();
        const stageJson = VirtualFS.stageJsons[item.stage] || VirtualFS.stageJsons[stageFolder] || null;

        for (const [path, entry] of Object.entries(VirtualFS.assets)) {
            if (path.includes(`bg/${stageFolder}/`)) {
                const key = path.split('/').pop().replace(/\.(png|jpg)$/, '');
                if (path.endsWith('.png') || path.endsWith('.jpg')) {
                    const blob = await entry.async('blob');
                    const img = new Image();
                    img.src = URL.createObjectURL(blob);
                    await new Promise(res => img.onload = res);
                    stageData[key] = PIXI.Texture.from(img);
                }
            }
        }

        // 4. Dynamic Animated Props Detection
        const stageProps = {};
        for (const path of Object.keys(VirtualFS.assets)) {
            if (path.includes(`bg/${stageFolder}/`)) {
                if (path.endsWith('.xml')) {
                    const propKey = path.split('/').pop().replace('.xml', '').toLowerCase();
                    stageProps[propKey] = await loadAnimatedProp(stageFolder, propKey);
                }
            }
        }

        playState = new PlayStateScene(item, dadChar, bfChar, gfChar, stageData, stageProps, stageJson, extraChars);

        activeCountdownTimer = setTimeout(() => {
            if (playState) {
                playState.showRating("GO!", 0x2ed573);
                const playTime = audioCtx.currentTime + 0.05;
                Conductor.activeSources.forEach(s => s.start(playTime));
                Conductor.start();
            }
            activeCountdownTimer = null;
        }, 1500);

    } catch(err) {
        console.error("Launch error:", err);
        alert("Failed to start song. Check console (F12).");
        returnToFreeplay();
    }
}

function returnToFreeplay() {
    if (activeCountdownTimer) {
        clearTimeout(activeCountdownTimer);
        activeCountdownTimer = null;
    }

    Conductor.stop();
    if (playState) {
        playState.destroy();
        playState = null;
    }

    gameContainer.classList.add('hidden');
    freeplayScreen.classList.remove('hidden');
}
