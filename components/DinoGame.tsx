'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const GAME_WIDTH = 800;
const GAME_HEIGHT = 300;
const GROUND_Y = 250;
const DINO_X = 80;
const DINO_WIDTH = 44;
const DINO_HEIGHT = 48;
const GRAVITY = 0.8;
const JUMP_FORCE = -15;
const INITIAL_SPEED = 6;
const SPEED_INCREMENT = 0.001;
const OBSTACLE_MIN_WIDTH = 17;
const OBSTACLE_MAX_WIDTH = 25;
const OBSTACLE_MIN_HEIGHT = 35;
const OBSTACLE_MAX_HEIGHT = 65;
const OBSTACLE_MIN_GAP = 300;
const OBSTACLE_MAX_GAP = 700;
const CLOUD_SPEED_RATIO = 0.3;

interface Obstacle {
  x: number;
  width: number;
  height: number;
  type: 'single' | 'double' | 'triple';
}

interface Cloud {
  x: number;
  y: number;
  width: number;
}

interface GameState {
  dinoY: number;
  dinoVY: number;
  isJumping: boolean;
  isDucking: boolean;
  obstacles: Obstacle[];
  clouds: Cloud[];
  score: number;
  highScore: number;
  speed: number;
  gameOver: boolean;
  started: boolean;
  groundOffset: number;
  frameCount: number;
  dinoFrame: number;
}

function createObstacle(x: number): Obstacle {
  const types: Array<'single' | 'double' | 'triple'> = ['single', 'double', 'triple'];
  const type = types[Math.floor(Math.random() * types.length)];
  const height = OBSTACLE_MIN_HEIGHT + Math.random() * (OBSTACLE_MAX_HEIGHT - OBSTACLE_MIN_HEIGHT);
  let width = OBSTACLE_MIN_WIDTH + Math.random() * (OBSTACLE_MAX_WIDTH - OBSTACLE_MIN_WIDTH);
  if (type === 'double') width *= 2.2;
  if (type === 'triple') width *= 3.2;
  return { x, width: Math.floor(width), height: Math.floor(height), type };
}

function createCloud(x: number): Cloud {
  return {
    x,
    y: 30 + Math.random() * 80,
    width: 60 + Math.random() * 60,
  };
}

export default function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    dinoY: GROUND_Y - DINO_HEIGHT,
    dinoVY: 0,
    isJumping: false,
    isDucking: false,
    obstacles: [],
    clouds: [createCloud(200), createCloud(500), createCloud(750)],
    score: 0,
    highScore: 0,
    speed: INITIAL_SPEED,
    gameOver: false,
    started: false,
    groundOffset: 0,
    frameCount: 0,
    dinoFrame: 0,
  });
  const animFrameRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const [displayScore, setDisplayScore] = useState(0);
  const [displayHighScore, setDisplayHighScore] = useState(0);
  const [gameStatus, setGameStatus] = useState<'idle' | 'running' | 'over'>('idle');

  // Pixel art dino — closely mimics the Chrome T-Rex
  // Each row is an array of column indices (0-based) that are filled
  // Grid: 0 = transparent, 1 = dark (#535353)
  const drawDino = useCallback((
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    frame: number,
    isDucking: boolean,
    isDead: boolean
  ) => {
    const S = 4; // pixel scale

    // Helper: fill a scaled pixel
    const px = (col: number, row: number, color = '#535353') => {
      ctx.fillStyle = color;
      ctx.fillRect(x + col * S, y + row * S, S, S);
    };

    if (!isDucking) {
      // ---- Standing / jumping dino (12 cols x 13 rows body grid) ----
      // Based on the actual Chrome dino pixel art
      // Row 0 (top of head)
      //          0123456789AB
      const rows = [
        '     XXXXX  ', // 0
        '     XXXXXXX', // 1
        '     XX X XX', // 2  eye area
        '     XXXXXXX', // 3
        '     XXXXX  ', // 4
        ' XXXXXXXXX  ', // 5  arm
        'XXXXXXXXXXX ', // 6
        ' XXXXXXXXX  ', // 7
        '   XXXXXXX  ', // 8
        '    XXXXX   ', // 9
        '    XX XX   ', // 10  legs
        '   XX   XX  ', // 11
        '   X     X  ', // 12
      ];

      // Leg animation — swap last 3 rows
      const legFrame = frame % 2 === 0;
      const legRows: string[] = [
        // frame 0: right leg forward
        '    XX XX   ',
        '   XX   XX  ',
        '   X     X  ',
        // frame 1: left leg forward
        '    XXXX    ',
        '    XX      ',
        '   XX       ',
      ];

      const fullRows = [
        ...rows.slice(0, 10),
        ...(legFrame ? legRows.slice(0, 3) : legRows.slice(3, 6)),
      ];

      fullRows.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          if (row[c] === 'X') {
            px(c, r);
          }
        }
      });

      // Eye — white part
      if (!isDead) {
        px(8, 2, '#ffffff');
        px(8, 1, '#ffffff');
        // pupil
        px(9, 2);
      } else {
        // Dead X eyes
        px(7, 1); px(9, 1);
        px(8, 2);
        px(7, 3); px(9, 3);
      }
    } else {
      // ---- Ducking dino (wider, shorter) ----
      const rows = [
        '          XXXXX  ',
        '          XXXXXXX',
        '          XX X XX',
        '          XXXXXXX',
        ' XXXXXXXXXXXXXXXXX',
        'XXXXXXXXXXXXXXXXXX',
        ' XXXXXXXXXXXXXXXXX',
        '  XXXXXXXXXXXXXXX ',
        '   XXXXX  XXXXX  ',
        '   XX      XX    ',
        '  XX        XX   ',
      ];

      rows.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          if (row[c] === 'X') {
            px(c, r);
          }
        }
      });

      // Eye
      if (!isDead) {
        px(13, 2, '#ffffff');
        px(14, 2, '#ffffff');
        px(14, 1, '#ffffff');
        px(15, 2);
      } else {
        px(12, 1); px(14, 1);
        px(13, 2);
        px(12, 3); px(14, 3);
      }
    }
  }, []);

  const drawCactus = useCallback((ctx: CanvasRenderingContext2D, obstacle: Obstacle) => {
    const { x, width, height, type } = obstacle;
    ctx.fillStyle = '#535353';

    if (type === 'single') {
      const stemW = Math.floor(width * 0.45);
      const stemX = x + Math.floor((width - stemW) / 2);
      ctx.fillRect(stemX, GROUND_Y - height, stemW, height);
      ctx.fillRect(x, GROUND_Y - height * 0.65, stemX - x, Math.floor(height * 0.15));
      ctx.fillRect(x, GROUND_Y - height * 0.85, Math.floor((stemX - x) * 0.4), Math.floor(height * 0.22));
      const rightStart = stemX + stemW;
      ctx.fillRect(rightStart, GROUND_Y - height * 0.55, width - stemW - (stemX - x), Math.floor(height * 0.15));
      ctx.fillRect(rightStart + Math.floor((width - stemW - (stemX - x)) * 0.6), GROUND_Y - height * 0.75, Math.floor((width - stemW - (stemX - x)) * 0.4), Math.floor(height * 0.22));
    } else if (type === 'double') {
      const halfW = Math.floor(width / 2.2);
      for (let i = 0; i < 2; i++) {
        const cx = x + i * (halfW + 4);
        const stemW = Math.floor(halfW * 0.45);
        const stemX = cx + Math.floor((halfW - stemW) / 2);
        ctx.fillRect(stemX, GROUND_Y - height, stemW, height);
        ctx.fillRect(cx, GROUND_Y - height * 0.65, stemX - cx, Math.floor(height * 0.15));
        ctx.fillRect(cx, GROUND_Y - height * 0.85, Math.floor((stemX - cx) * 0.4), Math.floor(height * 0.22));
        const rightStart = stemX + stemW;
        ctx.fillRect(rightStart, GROUND_Y - height * 0.55, halfW - stemW - (stemX - cx), Math.floor(height * 0.15));
      }
    } else {
      const thirdW = Math.floor(width / 3.2);
      for (let i = 0; i < 3; i++) {
        const cx = x + i * (thirdW + 3);
        const stemW = Math.floor(thirdW * 0.45);
        const stemX = cx + Math.floor((thirdW - stemW) / 2);
        ctx.fillRect(stemX, GROUND_Y - height, stemW, height);
        ctx.fillRect(cx, GROUND_Y - height * 0.65, stemX - cx, Math.floor(height * 0.15));
        const rightStart = stemX + stemW;
        ctx.fillRect(rightStart, GROUND_Y - height * 0.55, thirdW - stemW - (stemX - cx), Math.floor(height * 0.15));
      }
    }
  }, []);

  const drawCloud = useCallback((ctx: CanvasRenderingContext2D, cloud: Cloud) => {
    ctx.fillStyle = '#e0e0e0';
    const { x, y, width } = cloud;
    const h = width * 0.35;
    ctx.beginPath();
    ctx.ellipse(x + width * 0.5, y + h * 0.5, width * 0.5, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + width * 0.25, y + h * 0.7, width * 0.2, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + width * 0.75, y + h * 0.7, width * 0.2, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const drawGround = useCallback((ctx: CanvasRenderingContext2D, offset: number) => {
    ctx.fillStyle = '#535353';
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 3);
    ctx.fillStyle = '#888888';
    for (let i = 0; i < 30; i++) {
      const tx = ((i * 50 - offset) % GAME_WIDTH + GAME_WIDTH) % GAME_WIDTH;
      ctx.fillRect(tx, GROUND_Y + 6, 20 + (i % 3) * 10, 2);
    }
    for (let i = 0; i < 20; i++) {
      const tx = ((i * 70 + 20 - offset) % GAME_WIDTH + GAME_WIDTH) % GAME_WIDTH;
      ctx.fillRect(tx, GROUND_Y + 12, 15 + (i % 4) * 8, 2);
    }
  }, []);

  const drawScore = useCallback((ctx: CanvasRenderingContext2D, score: number, highScore: number) => {
    ctx.fillStyle = '#535353';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'right';
    const scoreStr = String(Math.floor(score)).padStart(5, '0');
    if (highScore > 0) {
      const hiStr = String(Math.floor(highScore)).padStart(5, '0');
      ctx.fillText(`HI ${hiStr}  ${scoreStr}`, GAME_WIDTH - 10, 30);
    } else {
      ctx.fillText(scoreStr, GAME_WIDTH - 10, 30);
    }
    ctx.textAlign = 'left';
  }, []);

  const checkCollision = useCallback((dinoY: number, isDucking: boolean, obstacles: Obstacle[]): boolean => {
    const dH = isDucking ? DINO_HEIGHT - 16 : DINO_HEIGHT;
    const dW = isDucking ? DINO_WIDTH + 12 : DINO_WIDTH;
    const margin = 6;
    const dinoRect = {
      left: DINO_X + margin,
      right: DINO_X + dW - margin,
      top: dinoY + margin,
      bottom: dinoY + dH - 2,
    };
    for (const obs of obstacles) {
      const obsRect = {
        left: obs.x + margin,
        right: obs.x + obs.width - margin,
        top: GROUND_Y - obs.height + margin,
        bottom: GROUND_Y,
      };
      if (
        dinoRect.right > obsRect.left &&
        dinoRect.left < obsRect.right &&
        dinoRect.bottom > obsRect.top &&
        dinoRect.top < obsRect.bottom
      ) {
        return true;
      }
    }
    return false;
  }, []);

  const jump = useCallback(() => {
    const state = stateRef.current;
    if (!state.isJumping && !state.gameOver && state.started) {
      stateRef.current = { ...state, dinoVY: JUMP_FORCE, isJumping: true };
    }
  }, []);

  const startGame = useCallback(() => {
    stateRef.current = {
      dinoY: GROUND_Y - DINO_HEIGHT,
      dinoVY: 0,
      isJumping: false,
      isDucking: false,
      obstacles: [],
      clouds: [createCloud(200), createCloud(500), createCloud(750)],
      score: 0,
      highScore: stateRef.current.highScore,
      speed: INITIAL_SPEED,
      gameOver: false,
      started: true,
      groundOffset: 0,
      frameCount: 0,
      dinoFrame: 0,
    };
    setGameStatus('running');
    setDisplayScore(0);
  }, []);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = stateRef.current;

    if (!state.started) {
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      drawGround(ctx, 0);
      drawDino(ctx, DINO_X, GROUND_Y - DINO_HEIGHT, 0, false, false);
      drawScore(ctx, 0, state.highScore);
      ctx.fillStyle = '#535353';
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS SPACE or TAP TO START', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
      ctx.textAlign = 'left';
      animFrameRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    if (state.gameOver) {
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      drawGround(ctx, state.groundOffset);
      state.clouds.forEach(c => drawCloud(ctx, c));
      state.obstacles.forEach(o => drawCactus(ctx, o));
      drawDino(ctx, DINO_X, state.dinoY, 0, false, true);
      drawScore(ctx, state.score, state.highScore);
      ctx.fillStyle = '#535353';
      ctx.font = 'bold 20px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 25);
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText('PRESS SPACE or TAP TO RESTART', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10);
      ctx.textAlign = 'left';
      animFrameRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const newSpeed = state.speed + SPEED_INCREMENT;
    const newGroundOffset = (state.groundOffset + newSpeed) % GAME_WIDTH;
    const newScore = state.score + 0.1;
    const newFrameCount = state.frameCount + 1;
    const newDinoFrame = newFrameCount % 20 < 10 ? 0 : 1;

    let newDinoY = state.dinoY + state.dinoVY;
    let newDinoVY = state.dinoVY + GRAVITY;
    let newIsJumping = state.isJumping;
    const groundLevel = GROUND_Y - DINO_HEIGHT;
    if (newDinoY >= groundLevel) {
      newDinoY = groundLevel;
      newDinoVY = 0;
      newIsJumping = false;
    }

    const isDucking = (keysRef.current.has('ArrowDown') || keysRef.current.has('s')) && !state.isJumping;
    const duckY = isDucking ? GROUND_Y - (DINO_HEIGHT - 16) : newDinoY;

    let newObstacles = state.obstacles
      .map(o => ({ ...o, x: o.x - newSpeed }))
      .filter(o => o.x + o.width > -10);

    if (newObstacles.length === 0) {
      newObstacles.push(createObstacle(GAME_WIDTH + 50));
    } else {
      const lastObs = newObstacles[newObstacles.length - 1];
      const gap = OBSTACLE_MIN_GAP + Math.random() * (OBSTACLE_MAX_GAP - OBSTACLE_MIN_GAP);
      if (lastObs.x + lastObs.width < GAME_WIDTH - gap) {
        newObstacles.push(createObstacle(GAME_WIDTH + 50));
      }
    }

    let newClouds = state.clouds
      .map(c => ({ ...c, x: c.x - newSpeed * CLOUD_SPEED_RATIO }))
      .filter(c => c.x + c.width > -10);
    if (newClouds.length < 3) {
      newClouds.push(createCloud(GAME_WIDTH + 50 + Math.random() * 200));
    }

    const hit = checkCollision(duckY, isDucking, newObstacles);
    const newHighScore = hit ? Math.max(state.highScore, Math.floor(newScore)) : state.highScore;

    stateRef.current = {
      ...state,
      dinoY: hit ? state.dinoY : duckY,
      dinoVY: hit ? 0 : newDinoVY,
      isJumping: hit ? false : newIsJumping,
      isDucking: hit ? false : isDucking,
      obstacles: newObstacles,
      clouds: newClouds,
      score: newScore,
      highScore: newHighScore,
      speed: newSpeed,
      gameOver: hit,
      groundOffset: newGroundOffset,
      frameCount: newFrameCount,
      dinoFrame: newDinoFrame,
    };

    if (hit) {
      setGameStatus('over');
      setDisplayHighScore(newHighScore);
    }

    if (newFrameCount % 6 === 0) {
      setDisplayScore(Math.floor(newScore));
    }

    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    newClouds.forEach(c => drawCloud(ctx, c));
    drawGround(ctx, newGroundOffset);
    newObstacles.forEach(o => drawCactus(ctx, o));
    drawDino(ctx, DINO_X, hit ? state.dinoY : duckY, newDinoFrame, isDucking && !hit, hit);
    drawScore(ctx, newScore, newHighScore);

    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [drawDino, drawCactus, drawCloud, drawGround, drawScore, checkCollision]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [gameLoop]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        const state = stateRef.current;
        if (!state.started || state.gameOver) {
          startGame();
        } else {
          jump();
        }
      }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startGame, jump]);

  const handleCanvasClick = useCallback(() => {
    const state = stateRef.current;
    if (!state.started || state.gameOver) {
      startGame();
    } else {
      jump();
    }
  }, [startGame, jump]);

  return (
    <div className="flex flex-col items-center select-none">
      <h1 className="text-3xl font-bold text-gray-700 mb-4" style={{ fontFamily: '"Courier New", monospace' }}>
        🦕 Dino Runner
      </h1>
      <div className="flex gap-8 mb-2 text-gray-600" style={{ fontFamily: '"Courier New", monospace' }}>
        <span className="text-sm font-bold">SCORE: {String(displayScore).padStart(5, '0')}</span>
        {displayHighScore > 0 && (
          <span className="text-sm font-bold">HI: {String(displayHighScore).padStart(5, '0')}</span>
        )}
      </div>
      <div
        className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-white shadow-lg cursor-pointer"
        style={{ width: GAME_WIDTH, maxWidth: '100vw' }}
        onClick={handleCanvasClick}
      >
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="block"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <div className="mt-4 text-center text-gray-500 text-sm" style={{ fontFamily: '"Courier New", monospace' }}>
        <p>SPACE / ↑ / W — Jump &nbsp;|&nbsp; ↓ / S — Duck &nbsp;|&nbsp; TAP — Jump</p>
        {gameStatus === 'running' && (
          <p className="mt-1 text-green-600 font-bold">RUNNING — AVOID THE CACTI!</p>
        )}
        {gameStatus === 'over' && (
          <p className="mt-1 text-red-500 font-bold">GAME OVER — PRESS SPACE OR TAP TO RESTART</p>
        )}
        {gameStatus === 'idle' && (
          <p className="mt-1 text-blue-500 font-bold">PRESS SPACE OR TAP TO START</p>
        )}
      </div>
    </div>
  );
}
