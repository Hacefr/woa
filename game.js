// ============================================================================
// GAME.JS - TRUE 1080P ROOM FRAMING (GROUNDS ROOM & STABILIZES CAMERA)
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

class PlayStateScene {
    constructor(songItem, dadChar, bfChar, gfChar, stageData, stageProps, stageJson) {
        this.songItem = songItem;
        this.speed = songItem.speed || 2.5;

        this.worldContainer = new PIXI.Container();
        this.hudContainer = new PIXI.Container();

        this.dad = dadChar;
        this.bf = bfChar;
        this.gf = gfChar;

        this.notes = [];
        this.receptors = [];
        this.score = 0;
        this.combo = 0;
        this.misses = 0;
        this.totalNotesHit = 0;
        this.totalNotesPossible = 0;
        this.health = 1.0;

        this.gfDanceLeft = false;
        this.animatedProps = [];
        this.discussSprite = null;

        // V-Slice Camera Zoom
        this.camZoom = (stageJson && stageJson.cameraZoom) ? stageJson.cameraZoom : 0.7;
        this.baseZoom = this.camZoom;

        this.setupStage(stageData, stageProps, stageJson);
        this.setupCharacters(stageJson);
        this.setupStrumlines();
        this.parseChartNotes(songItem.chartData);
        this.setupHUD();

        app.stage.addChild(this.worldContainer);
        app.stage.addChild(this.hudContainer);
    }

    setupStage(stageData, stageProps, stageJson) {
        this.stageBack = new PIXI.Container();
        this.stageFront = new PIXI.Container();

        if (stageJson && stageJson.props) {
            stageJson.props.forEach(p => {
                const cleanName = p.assetPath.split('/').pop().toLowerCase();
                const tex = stageData[cleanName];

                // 1. Color Overlays (#000000, #FF0000)
                if (p.assetPath && p.assetPath.startsWith('#')) {
                    const g = new PIXI.Graphics();
                    const hexColor = parseInt(p.assetPath.replace('#', '0x'), 16) || 0x000000;
                    g.beginFill(hexColor);
                    g.drawRect(-3000, -3000, 8000, 8000);
                    g.endFill();
                    
                    g.alpha = 0;
                    if (p.blend === 'multiply') g.blendMode = PIXI.BLEND_MODES.MULTIPLY;
                    if (p.blend === 'subtract') g.blendMode = PIXI.BLEND_MODES.SUBTRACT;
                    if (p.blend === 'add') g.blendMode = PIXI.BLEND_MODES.ADD;
                    g.zIndex = p.zIndex || 0;

                    if (p.zIndex >= 300) this.stageFront.addChild(g);
                    else this.stageBack.addChild(g);
                    return;
                }

                // 2. Animated XML Props
                if (stageProps[cleanName]) {
                    const animTextures = Object.values(stageProps[cleanName])[0];
                    const aSpr = new PIXI.AnimatedSprite(animTextures);
                    aSpr.position.set(p.position[0], p.position[1]);
                    aSpr.scale.set(p.scale || 1);
                    aSpr.zIndex = p.zIndex || 0;
                    aSpr.alpha = (p.alpha !== undefined) ? p.alpha : 1;
                    aSpr.loop = false;

                    this.stageBack.addChild(aSpr);

                    this.animatedProps.push({
                        sprite: aSpr,
                        bopInterval: (cleanName === 'shit' || cleanName.includes('bopper2')) ? 2 : 1
                    });
                }
                // 3. Static Props
                else if (tex) {
                    const spr = new PIXI.Sprite(tex);
                    spr.position.set(p.position[0], p.position[1]);
                    
                    const isBackdrop = (cleanName === 'bg' || cleanName === 'sky' || cleanName === 'wall');
                    const propScale = p.scale || 1;
                    spr.scale.set(isBackdrop ? propScale * 1.3 : propScale);

                    spr.alpha = (p.alpha !== undefined) ? p.alpha : 1;
                    if (p.blend === 'subtract') spr.blendMode = PIXI.BLEND_MODES.SUBTRACT;
                    if (p.blend === 'add') spr.blendMode = PIXI.BLEND_MODES.ADD;
                    spr.zIndex = p.zIndex || 0;

                    if (cleanName === 'discuss') {
                        this.discussSprite = spr;
                        spr.alpha = 0;
                    }

                    if (p.zIndex >= 300) {
                        this.stageFront.addChild(spr);
                    } else {
                        this.stageBack.addChild(spr);
                    }
                }
            });

            this.stageBack.sortChildren();
            this.stageFront.sortChildren();
        } else if (stageData && stageData.wall) {
            const wall = new PIXI.Sprite(stageData.wall);
            wall.anchor.set(0.5);
            wall.position.set(640, 360);
            this.stageBack.addChild(wall);
        }

        this.worldContainer.addChild(this.stageBack);
    }

    setupCharacters(stageJson) {
        const c = (stageJson && stageJson.characters) ? stageJson.characters : null;

        if (c) {
            if (this.dad && c.dad) {
                this.dad.container.position.set(c.dad.position[0], c.dad.position[1]);
            }
            if (this.bf && c.bf) {
                this.bf.container.position.set(c.bf.position[0], c.bf.position[1]);
            }
            if (this.gf) {
                if (c.gf && c.gf.position) {
                    this.gf.container.position.set(c.gf.position[0], c.gf.position[1]);
                    if (c.gf.scale) this.gf.container.scale.set(c.gf.scale);
                    this.gf.container.visible = true;
                } else {
                    this.gf.container.visible = false;
                }
            }
        } else {
            if (this.dad) this.dad.container.position.set(303, 861);
            if (this.bf) this.bf.container.position.set(970, 892);
            if (this.gf) this.gf.container.position.set(604, 424);
        }

        if (this.gf && this.gf.container.visible) this.worldContainer.addChild(this.gf.container);
        if (this.dad) this.worldContainer.addChild(this.dad.container);
        if (this.bf) this.worldContainer.addChild(this.bf.container);

        this.worldContainer.addChild(this.stageFront);

        // TRUE ROOM CENTER: Y = 460 brings the entire room down to the floor
        const dadX = this.dad ? this.dad.container.position.x : 300;
        const bfX = this.bf ? this.bf.container.position.x : 1000;
        const stageMidX = (dadX + bfX) / 2;
        const stageMidY = 460; // Natural 1080p vertical center

        this.stageCenterX = stageMidX;
        this.stageCenterY = stageMidY;

        this.camTargetX = stageMidX;
        this.camTargetY = stageMidY;
        this.camFocusX = stageMidX;
        this.camFocusY = stageMidY;
    }

    setupStrumlines() {
        const startX_Opponent = 120;
        const startX_Player = 760;
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
        if (!chart) return;

        const data = chart.chartData || chart;
        const songObj = (data.song && typeof data.song === 'object') ? data.song : data;

        if (data.notes && typeof data.notes === 'object' && !Array.isArray(data.notes)) {
            const diffNotes = data.notes.normal || data.notes.hard || data.notes.default || Object.values(data.notes)[0];
            if (Array.isArray(diffNotes)) {
                diffNotes.forEach(n => {
                    const rawDir = n.d !== undefined ? n.d : (n.dir || 0);
                    this.notes.push({
                        time: n.t !== undefined ? n.t : n.time,
                        dir: rawDir % 4,
                        isPlayer: (rawDir < 4),
                        sustain: n.l !== undefined ? n.l : (n.sLen || 0),
                        hit: false, missed: false, sprite: null, tailSprite: null
                    });
                });
            }
        }

        const strumLines = data.strumLines || (data.song && data.song.strumLines);
        if (this.notes.length === 0 && Array.isArray(strumLines)) {
            strumLines.forEach((strum, lineIndex) => {
                const isPlayer = (strum.type === 1) || (lineIndex === 1);
                if (Array.isArray(strum.notes)) {
                    strum.notes.forEach(n => {
                        this.notes.push({
                            time: n.time || 0,
                            dir: (n.id !== undefined ? n.id : (n.dir || 0)) % 4,
                            isPlayer: isPlayer,
                            sustain: n.sLen || n.sustain || 0,
                            hit: false, missed: false, sprite: null, tailSprite: null
                        });
                    });
                }
            });
        }

        if (this.notes.length === 0) {
            let sections = songObj.notes || data.notes || [];
            if (sections && typeof sections === 'object' && !Array.isArray(sections)) {
                sections = Object.values(sections);
            }

            if (Array.isArray(sections)) {
                sections.forEach(section => {
                    if (section && Array.isArray(section.sectionNotes)) {
                        section.sectionNotes.forEach(n => {
                            if (!Array.isArray(n) || n.length < 2) return;
                            const rawDir = n[1];
                            if (rawDir < 0) return;

                            this.notes.push({
                                time: n[0],
                                dir: rawDir % 4,
                                isPlayer: (rawDir < 4),
                                sustain: n[2] || 0,
                                hit: false, missed: false, sprite: null, tailSprite: null
                            });
                        });
                    }
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
        this.healthBarCont.position.set(640, 645);

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
        this.scoreText.position.set(640, 678);
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

    update(deltaSec) {
        const songPos = Conductor.songPosition;
        const receptorY = 85;
        const scrollMult = 0.32 * this.speed;

        if (this.dad) this.dad.update(deltaSec);
        if (this.bf) this.bf.update(deltaSec);
        if (this.gf && this.gf.container.visible) this.gf.update(deltaSec);

        // Icon bounce lerp
        this.dadIcon.scale.x += (1.0 - this.dadIcon.scale.x) * 0.15;
        this.dadIcon.scale.y += (1.0 - this.dadIcon.scale.y) * 0.15;
        this.bfIcon.scale.x += (1.0 - this.bfIcon.scale.x) * 0.15;
        this.bfIcon.scale.y += (1.0 - this.bfIcon.scale.y) * 0.15;

        // Smooth Camera Lerp
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

            // Opponent note hit: gentle 80px shift to the left
            if (!n.isPlayer && diff <= 0) {
                n.hit = true;
                n.sprite.visible = false;
                if (n.tailSprite) n.tailSprite.visible = false;
                this.hitReceptor(n.dir, false);

                const anims = ['left', 'down', 'up', 'right'];
                if (this.dad) {
                    this.dad.playAnim(anims[n.dir], true);
                    this.camTargetX = this.stageCenterX - 80;
                    this.camTargetY = this.stageCenterY;
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

            // Draw note on screen
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
            this.camTargetX = this.stageCenterX + 80;
            this.camTargetY = this.stageCenterY;
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

            if (minDiff <= 45) {
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

    destroy() {
        app.stage.removeChild(this.worldContainer);
        app.stage.removeChild(this.hudContainer);
        this.worldContainer.destroy({ children: true });
        this.hudContainer.destroy({ children: true });
    }
}

// ============================================================================
// SCRIPTED MOMENTS
// ============================================================================
function onStepHit(step) {
    if (!playState) return;
    const currentSong = playState.songItem.id.toLowerCase();

    // Song 2: "Suspect" scripted events
    if (currentSong.includes('suspect')) {
        if (step === 60 && playState.discussSprite) {
            playState.discussSprite.alpha = 1;
        }
        if (step === 64 && playState.discussSprite) {
            playState.discussSprite.alpha = 0;
        }
        if (step === 805) {
            if (playState.bf) {
                playState.bf.playAnim('lock in', true);
                playState.bf.holdTimer = 1.5;
            }
        }
        if (step === 812) {
            if (playState.bf) {
                playState.bf.playAnim('cock', true);
                playState.bf.holdTimer = 1.0;
            }
            if (playState.dad) playState.dad.playAnim('right', true);
        }
        if (step === 816) {
            if (playState.bf) {
                playState.bf.playAnim('blast', true);
                playState.bf.holdTimer = 1.2;
            }
            playState.camZoom = playState.baseZoom + 0.08;
        }
    }
}

function onBeatHit(beat) {
    if (!playState) return;
    const currentSong = playState.songItem.id.toLowerCase();

    if (currentSong.includes('trot')) {
        playState.camZoom = playState.baseZoom + (beat % 2 === 0 ? 0.04 : 0.015);
    } else {
        playState.camZoom = playState.baseZoom + 0.035;
    }

    if (playState.dadIcon) playState.dadIcon.scale.set(1.25);
    if (playState.bfIcon) playState.bfIcon.scale.set(1.25);

    if (playState.gf && playState.gf.container.visible) {
        playState.gfDanceLeft = !playState.gfDanceLeft;
        playState.gf.playAnim(playState.gfDanceLeft ? 'idleleft' : 'idleright', true);
    }

    playState.animatedProps.forEach(prop => {
        if (beat % prop.bopInterval === 0) {
            prop.sprite.gotoAndPlay(0);
        }
    });

    if (playState.dad && playState.dad.holdTimer <= 0) playState.dad.playAnim('idle');
    if (playState.bf && playState.bf.holdTimer <= 0) playState.bf.playAnim('idle');

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
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    freeplayScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    if (playState) playState.destroy();

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
        const gfChar = await loadCharacter('gf', false, true);

        // 2. Load Stage Dynamically
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

        // 3. Dynamic Animated Props Detection
        const stageProps = {};
        for (const path of Object.keys(VirtualFS.assets)) {
            if (path.includes(`bg/${stageFolder}/`)) {
                if (path.endsWith('.xml')) {
                    const propKey = path.split('/').pop().replace('.xml', '').toLowerCase();
                    stageProps[propKey] = await loadAnimatedProp(stageFolder, propKey);
                }
            }
        }

        playState = new PlayStateScene(item, dadChar, bfChar, gfChar, stageData, stageProps, stageJson);

        setTimeout(() => {
            if (playState) {
                playState.showRating("GO!", 0x2ed573);
                const playTime = audioCtx.currentTime + 0.05;
                Conductor.activeSources.forEach(s => s.start(playTime));
                Conductor.start();
            }
        }, 1500);

    } catch(err) {
        console.error("Launch error:", err);
        alert("Failed to start song. Check console (F12).");
        returnToFreeplay();
    }
}

function returnToFreeplay() {
    Conductor.stop();
    if (playState) {
        playState.destroy();
        playState = null;
    }

    gameContainer.classList.add('hidden');
    freeplayScreen.classList.remove('hidden');
}
