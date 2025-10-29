import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, HostListener, OnDestroy } from '@angular/core';
import { AlertController } from '@ionic/angular';

// 遊戲物件介面
interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  speed?: number;
}

interface Bullet extends GameObject {
  active: boolean;
  type: 'note' | 'heart'; // 子彈類型：音符或愛心
  color: string; // 子彈顏色
  velocityX?: number; // 水平速度（用於偏射）
  velocityY?: number; // 垂直速度（用於偏射）
}

interface Enemy extends GameObject {
  active: boolean;
  type: 'mineral' | 'crystal'; // 礦石或水晶
  color: string; // 顏色
  shape: number; // 形狀變化（0-2：不同的礦石/水晶形狀）
  glowPhase?: number; // 水晶閃爍相位
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animationId: number = 0;

  // 遊戲狀態
  gameStarted = false;
  gameOver = false;
  score = 0;
  lives = 5; // 生命數（5碗飯）
  showInstructionsOnStart = true; // 控制是否在開始時顯示說明
  showWelcomeScreen = true; // 控制入口頁面顯示

  // Canvas 尺寸（默認為移動端）
  private CANVAS_WIDTH = 400;
  private CANVAS_HEIGHT = 600;
  
  // 性能模式檢測
  private isMobile = false;
  private performanceMode: 'high' | 'medium' | 'low' = 'high';

  // 玩家戰機
  private player: GameObject = {
    x: 0,
    y: 0,
    width: 30,
    height: 40,
    speed: 5
  };

  // 子彈和敵機陣列
  private bullets: Bullet[] = [];
  private enemies: Enemy[] = [];

  // 鍵盤狀態
  private keys: { [key: string]: boolean } = {};

  // 敵機生成計時器
  private enemySpawnTimer = 0;
  private readonly ENEMY_SPAWN_INTERVAL = 60; // 每60幀生成一個敵機

  // 觸控控制 - 虛擬搖桿
  joystickX = 0;
  joystickY = 0;
  private joystickActive = false;
  private joystickBaseX = 0;
  private joystickBaseY = 0;
  private readonly JOYSTICK_MAX_DISTANCE = 40; // 搖桿最大移動距離

  // 觸控控制 - 移動方向
  private touchMoveDirection = { x: 0, y: 0 };

  // 射擊按鈕狀態
  private shootButtonPressed = false;
  private shootCooldown = 0;
  private readonly SHOOT_COOLDOWN = 10; // 發射冷卻時間（幀數）
  private shootCount = 0; // 連續射擊計數器

  // 移動步數追踪和閃光效果
  private verticalMoveCount = 0; // 上下移動步數計數器
  private horizontalMoveCount = 0; // 左右移動步數計數器
  private lastPlayerY = 0; // 記錄上一幀的 Y 位置
  private lastPlayerX = 0; // 記錄上一幀的 X 位置
  private isGlowing = false; // 是否正在發光（金光）
  private glowIntensity = 0; // 發光強度（0-1）
  private glowPhase = 0; // 發光動畫相位
  private readonly MOVE_THRESHOLD = 3; // 觸發閃光的移動步數閾值
  private lastGlowTriggerTime = 0; // 上次觸發金光的時間
  private readonly GLOW_COOLDOWN_MOBILE = 2000; // 移動端金光冷卻時間（毫秒）- 更長
  private readonly GLOW_COOLDOWN_DESKTOP = 800; // 桌面端金光冷卻時間（毫秒）
  private lastRippleTriggerTime = 0; // 上次觸發光圈的時間
  
  // 银光效果（连续打到水晶触发）
  private crystalHitCount = 0; // 連續打到水晶的計數器
  private lastHitTime = 0; // 上次打到水晶的時間
  private isSilverGlowing = false; // 是否正在發銀光
  private silverGlowIntensity = 0; // 銀光強度（0-1）
  private silverGlowPhase = 0; // 銀光動畫相位
  private readonly CRYSTAL_HIT_THRESHOLD = 3; // 觸發銀光的連續打擊閾值
  private readonly CRYSTAL_HIT_TIMEOUT = 2000; // 連續打擊超時時間（毫秒）
  
  // 金光和银光重叠控制
  private bothGlowsStartTime = 0; // 兩種光同時存在的開始時間
  private readonly MAX_OVERLAP_TIME = 4000; // 最大重疊時間（3-5秒之間，這裡設置4秒）
  
  // 增強視覺特效
  private shockwaves: Array<{radius: number, alpha: number, maxRadius: number}> = []; // 震動波陣列
  private trailParticles: Array<{x: number, y: number, alpha: number, size: number}> = []; // 拖尾粒子
  private ripples: Array<{x: number, y: number, radius: number, alpha: number}> = []; // 光圈漣漪

  // 音效系統
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  audioContextState: string = '未初始化'; // 用於顯示音頻狀態（public，供模板使用）
  private lastMoveDirection: 'horizontal' | 'vertical' | 'diagonal' | null = null;
  private engineSoundNodes: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private gearSoundNodes: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private currentEngineType: number = 0; // 當前引擎類型（0-4）
  
  // 演唱會燈光系統
  private spotlights: Array<{x: number, y: number, radius: number, color: string, alpha: number, angle: number, speed: number}> = [];
  private laserBeams: Array<{x: number, y: number, targetX: number, targetY: number, color: string, alpha: number, width: number}> = [];
  private flashEffect = { active: false, alpha: 0, color: '#FFFFFF' };
  private colorCycle = 0;
  private beatPhase = 0;
  
  // 背景音樂系統
  private bgMusicNodes: { osc1: OscillatorNode; osc2: OscillatorNode; osc3: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  private beatInterval: any = null;

  constructor(private alertController: AlertController) {}

  ngOnInit() {
    console.log('飛機射擊遊戲初始化');
    this.detectPerformanceMode();
  }
  
  // 檢測性能模式
  private detectPerformanceMode() {
    // 檢測是否為移動設備
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // 根據設備和屏幕尺寸設置性能模式
    if (this.isMobile) {
      // 移動設備默認使用低性能模式
      this.performanceMode = 'low';
      
      // 如果是較新的設備（通過 devicePixelRatio 判斷），可以使用中等性能
      if (window.devicePixelRatio >= 2 && window.innerWidth >= 375) {
        this.performanceMode = 'medium';
      }
    } else {
      // 桌面設備使用高性能模式
      this.performanceMode = 'high';
    }
    
    console.log(`🎮 性能模式: ${this.performanceMode}, 移動設備: ${this.isMobile}`);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.initCanvas();
      // 入口頁面會顯示說明，不需要在這裡彈窗
    }, 100);
  }
  
  // 測試音頻功能（用於診斷）- iOS 關鍵：同步調用
  testAudio() {
    console.log('🔧 手動測試音頻...');
    
    if (!this.audioContext) {
      console.log('⚠️ 音頻上下文未初始化，正在初始化...');
      this.initAudio();
    }
    
    if (this.audioContext) {
      console.log('當前狀態:', this.audioContext.state);
      
      // 同步調用 resume（這是 iOS Safari 的關鍵）
      const resumePromise = this.audioContext.state === 'suspended' 
        ? this.audioContext.resume() 
        : Promise.resolve();
      
      resumePromise.then(() => {
        if (!this.audioContext) return;
        
        this.audioContextState = this.audioContext.state;
        console.log('✅ 音頻狀態:', this.audioContext.state);
        
        try {
          // 播放測試音（440Hz A音，持續0.5秒，音量更大）
          const osc = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, this.audioContext.currentTime);
          
          gain.gain.setValueAtTime(0, this.audioContext.currentTime);
          gain.gain.linearRampToValueAtTime(0.4, this.audioContext.currentTime + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
          
          osc.connect(gain);
          gain.connect(this.audioContext.destination);
          
          osc.start(this.audioContext.currentTime);
          osc.stop(this.audioContext.currentTime + 0.5);
          
          console.log('🎵 測試音已播放（440Hz，持續0.5秒）');
          
          // 更新狀態顯示
          setTimeout(() => {
            if (this.audioContext) {
              this.audioContextState = this.audioContext.state;
              console.log('🔊 測試後狀態:', this.audioContext.state);
            }
          }, 100);
          
        } catch (err: any) {
          console.error('❌ 播放測試音失敗:', err);
          alert('播放測試音失敗: ' + (err?.message || err));
        }
        
      }).catch((err: any) => {
        console.error('❌ 測試音頻失敗:', err);
        alert('音頻測試失敗: ' + (err?.message || err));
      });
      
    } else {
      console.error('❌ 無法創建音頻上下文');
      alert('無法創建音頻上下文');
    }
  }
  
  // 從入口頁面進入遊戲（iOS 關鍵：必須同步調用 resume）
  enterGame() {
    this.showWelcomeScreen = false;
    
    // 初始化音頻系統（需要用戶交互才能在iOS上工作）
    this.initAudio();
    
    // iOS Safari 關鍵：必須在用戶交互的同步回調中立即調用 resume()
    if (this.audioContext) {
      console.log('🔧 enterGame - 音頻狀態 (before resume):', this.audioContext.state);
      
      // 同步調用 resume（不使用 await）
      const resumePromise = this.audioContext.resume();
      
      // 立即播放測試音（在 resume 的 Promise 鏈中）
      resumePromise.then(() => {
        if (!this.audioContext) return;
        
        this.audioContextState = this.audioContext.state;
        console.log('✅ 音頻上下文已啟動！狀態:', this.audioContext.state);
        
        try {
          // 播放短促可聽見的測試音
          const testOsc = this.audioContext.createOscillator();
          const testGain = this.audioContext.createGain();
          
          testOsc.type = 'sine';
          testOsc.frequency.setValueAtTime(800, this.audioContext.currentTime);
          
          testGain.gain.setValueAtTime(0, this.audioContext.currentTime);
          testGain.gain.linearRampToValueAtTime(0.15, this.audioContext.currentTime + 0.01);
          testGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
          
          testOsc.connect(testGain);
          testGain.connect(this.audioContext.destination);
          testOsc.start(this.audioContext.currentTime);
          testOsc.stop(this.audioContext.currentTime + 0.2);
          
          console.log('🎵 測試音已播放');
        } catch (err) {
          console.error('❌ 播放測試音失敗:', err);
        }
        
        // 更新狀態顯示
        setTimeout(() => {
          if (this.audioContext) {
            this.audioContextState = this.audioContext.state;
            console.log('🔊 最終音頻狀態:', this.audioContext.state);
          }
        }, 300);
        
      }).catch((err: any) => {
        console.error('❌ 啟動音頻上下文失敗:', err);
        this.audioContextState = '啟動失敗: ' + (err?.message || err);
      });
    }
    
    // 等待一下讓DOM更新
    setTimeout(() => {
      console.log('✅ 已從入口頁面進入遊戲');
    }, 100);
  }

  ngOnDestroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    // 清理音效資源
    this.stopAllSounds();
    this.stopBackgroundMusic();
    if (this.beatInterval) {
      clearInterval(this.beatInterval);
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  // 監聽鍵盤按下
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (!this.gameStarted || this.gameOver) return;
    
    // 阻止方向鍵和空白鍵的默認滾動行為
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    
    this.keys[event.key] = true;
    
    // 空白鍵發射子彈
    if (event.key === ' ') {
      this.shootBullet();
    }
  }

  // 監聽鍵盤放開
  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
    this.keys[event.key] = false;
  }

  // 初始化 Canvas
  private initCanvas() {
    this.canvas = this.canvasRef.nativeElement;
    const context = this.canvas.getContext('2d', {
      alpha: false, // 禁用透明度提升性能
      desynchronized: true // 降低延遲
    });
    
    if (!context) {
      console.error('無法獲取 Canvas 2D 上下文');
      return;
    }
    
    this.ctx = context;
    
    // 根據螢幕大小設定 Canvas 尺寸（適應螢幕高度）
    const availableHeight = window.innerHeight - 180; // 扣除標題和其他元素的空間
    
    // 移動端降低分辨率提升性能
    const scale = this.performanceMode === 'low' ? 0.8 : 1.0;
    
    if (window.innerWidth >= 768) {
      this.CANVAS_WIDTH = 500 * scale;
      this.CANVAS_HEIGHT = Math.min(650, availableHeight) * scale;
    } else {
      this.CANVAS_WIDTH = Math.min(400, window.innerWidth - 40) * scale;
      this.CANVAS_HEIGHT = Math.min(600, availableHeight) * scale;
    }
    
    this.canvas.width = this.CANVAS_WIDTH;
    this.canvas.height = this.CANVAS_HEIGHT;
    
    // 移動端優化：關閉圖像平滑
    if (this.performanceMode === 'low') {
      this.ctx.imageSmoothingEnabled = false;
    }
    
    // 初始化玩家位置
    this.player.x = this.CANVAS_WIDTH / 2 - this.player.width / 2;
    this.player.y = this.CANVAS_HEIGHT - this.player.height - 20;
    
    console.log('Canvas 初始化成功', `尺寸: ${this.CANVAS_WIDTH}x${this.CANVAS_HEIGHT}`, `性能模式: ${this.performanceMode}`);
  }

  // 開始遊戲（iOS 關鍵：同步調用 resume）
  startGame() {
    // 確保音頻上下文已啟動（iOS 兼容性）
    if (this.audioContext && this.audioContext.state === 'suspended') {
      console.log('🔧 startGame - 嘗試啟動音頻，當前狀態:', this.audioContext.state);
      
      // 同步調用 resume
      this.audioContext.resume().then(() => {
        if (this.audioContext) {
          this.audioContextState = this.audioContext.state;
          console.log('✅ 音頻上下文已在 startGame 中啟動，狀態:', this.audioContext.state);
        }
      }).catch((err: any) => {
        console.error('❌ startGame 中啟動音頻失敗:', err);
        this.audioContextState = '啟動失敗';
      });
    }
    
    this.gameStarted = true;
    this.gameOver = false;
    this.score = 0;
    this.lives = 5; // 重置生命為5
    this.bullets = [];
    this.enemies = [];
    this.enemySpawnTimer = 0;
    this.showInstructionsOnStart = false; // 遊戲開始後不再自動顯示說明
    
    // 重置玩家位置
    this.player.x = this.CANVAS_WIDTH / 2 - this.player.width / 2;
    this.player.y = this.CANVAS_HEIGHT - this.player.height - 20;
    
    // 重置移動和閃光相關變數
    this.verticalMoveCount = 0;
    this.horizontalMoveCount = 0;
    this.lastPlayerY = this.player.y;
    this.lastPlayerX = this.player.x;
    this.isGlowing = false;
    this.glowIntensity = 0;
    this.glowPhase = 0;
    this.lastRippleTriggerTime = 0;
    
    // 重置銀光相關變數
    this.crystalHitCount = 0;
    this.lastHitTime = 0;
    this.isSilverGlowing = false;
    this.silverGlowIntensity = 0;
    this.silverGlowPhase = 0;
    this.bothGlowsStartTime = 0;
    
    // 重置射擊計數器
    this.shootCount = 0;
    
    // 重置增強視覺特效
    this.shockwaves = [];
    this.trailParticles = [];
    this.ripples = [];
    
    // 重置演唱會燈光效果
    this.spotlights = [];
    this.laserBeams = [];
    this.flashEffect = { active: false, alpha: 0, color: '#FFFFFF' };
    this.colorCycle = 0;
    this.beatPhase = 0;
    
    // 播放開始音效（音頻系統已在enterGame中初始化）
    this.playGameStartSound();
    
    // 啟動背景音樂和演唱會燈光
    this.startBackgroundMusic();
    this.initConcertLights();
    
    // 設置觸控控制（等待 DOM 更新後）
    setTimeout(() => {
      this.setupTouchControls();
    }, 100);
    
    this.gameLoop();
  }

  // 重新開始遊戲
  restartGame() {
    this.startGame();
  }

  // 遊戲主循環
  private gameLoop() {
    if (!this.gameStarted || this.gameOver) return;

    this.update();
    this.draw();

    this.animationId = requestAnimationFrame(() => this.gameLoop());
  }

  // 更新遊戲狀態
  private update() {
    // 更新玩家位置
    this.updatePlayer();
    
    // 更新子彈
    this.updateBullets();
    
    // 更新敵機
    this.updateEnemies();
    
    // 生成敵機
    this.spawnEnemies();
    
    // 碰撞檢測
    this.checkCollisions();
    
    // 更新演唱會燈光效果
    this.updateConcertLights();
  }

  // 更新玩家位置
  private updatePlayer() {
    // 記錄移動前的位置
    const prevX = this.player.x;
    const prevY = this.player.y;
    
    // 鍵盤控制（用於電腦測試）
    if (this.keys['ArrowLeft'] && this.player.x > 0) {
      this.player.x -= this.player.speed!;
    }
    if (this.keys['ArrowRight'] && this.player.x < this.CANVAS_WIDTH - this.player.width) {
      this.player.x += this.player.speed!;
    }
    if (this.keys['ArrowUp'] && this.player.y > 0) {
      this.player.y -= this.player.speed!;
    }
    if (this.keys['ArrowDown'] && this.player.y < this.CANVAS_HEIGHT - this.player.height) {
      this.player.y += this.player.speed!;
    }
    
    // 觸控搖桿控制（用於手機）
    if (this.joystickActive) {
      const moveSpeed = this.player.speed! * 1.2; // 稍微快一點
      
      // 左右移動
      this.player.x += this.touchMoveDirection.x * moveSpeed;
      
      // 上下移動
      this.player.y += this.touchMoveDirection.y * moveSpeed;
      
      // 限制在畫布範圍內
      this.player.x = Math.max(0, Math.min(this.CANVAS_WIDTH - this.player.width, this.player.x));
      this.player.y = Math.max(0, Math.min(this.CANVAS_HEIGHT - this.player.height, this.player.y));
    }
    
    // 檢測移動方向並播放對應音效
    const xMoved = Math.abs(this.player.x - prevX) > 0.5;
    const yMoved = Math.abs(this.player.y - prevY) > 0.5;
    
    if (xMoved && !yMoved) {
      // 只有左右移動 - 播放齒輪聲
      if (this.lastMoveDirection !== 'horizontal') {
        this.stopMovementSounds(); // 先停止其他音效
        this.playGearSound();
        this.lastMoveDirection = 'horizontal';
      }
    } else if (yMoved && !xMoved) {
      // 只有前後移動 - 播放引擎聲
      if (this.lastMoveDirection !== 'vertical') {
        this.stopMovementSounds(); // 先停止其他音效
        this.playEngineSound();
        this.lastMoveDirection = 'vertical';
      }
    } else if (xMoved && yMoved) {
      // 斜向移動 - 混合播放兩種聲音
      if (this.lastMoveDirection !== 'diagonal') {
        this.stopMovementSounds(); // 先停止其他音效
        this.playGearSound();
        this.playEngineSound();
        this.lastMoveDirection = 'diagonal';
      }
    } else {
      // 沒有移動 - 停止所有移動音效
      if (this.lastMoveDirection !== null) {
        this.stopMovementSounds();
        this.lastMoveDirection = null;
      }
    }
    
    // 追踪左右移動（用於光圈漣漪）
    const xDiff = Math.abs(this.player.x - this.lastPlayerX);
    const xMoveThreshold = this.isMobile ? 2 : 1; // 移動端需要更大的移動量
    
    if (xDiff > xMoveThreshold) {
      this.horizontalMoveCount++;
      this.lastPlayerX = this.player.x;
      
      // 左右移動時創建光圈漣漪（有冷卻時間，避免太頻繁）
      const currentTime = Date.now();
      const rippleCooldown = this.isMobile ? 500 : 200; // 移動端冷卻更長
      const timeSinceLastRipple = currentTime - this.lastRippleTriggerTime;
      
      if (this.horizontalMoveCount >= 2 && timeSinceLastRipple >= rippleCooldown) {
        // 創建光圈漣漪（桌面端創建更多）
        const rippleCount = this.isMobile ? 1 : 2;
        for (let i = 0; i < rippleCount; i++) {
          setTimeout(() => {
            this.createRipple();
          }, i * 80);
        }
        this.lastRippleTriggerTime = currentTime;
        this.horizontalMoveCount = 0; // 重置計數器
      }
    }
    
    // 追踪上下移動步數（移動端降低敏感度）
    const yDiff = Math.abs(this.player.y - this.lastPlayerY);
    const yMoveThreshold = this.isMobile ? 2 : 1; // 移動端需要更大的移動量才計數
    
    if (yDiff > yMoveThreshold) {
      this.verticalMoveCount++;
      this.lastPlayerY = this.player.y;
      
      // 添加拖尾粒子
      this.addTrailParticles();
      
      // 當移動步數達到閾值且冷卻時間已過時，觸發閃光效果（金光）
      const currentTime = Date.now();
      const glowCooldown = this.isMobile ? this.GLOW_COOLDOWN_MOBILE : this.GLOW_COOLDOWN_DESKTOP;
      const timeSinceLastGlow = currentTime - this.lastGlowTriggerTime;
      
      if (this.verticalMoveCount >= this.MOVE_THRESHOLD && 
          !this.isGlowing && 
          timeSinceLastGlow >= glowCooldown) {
        this.isGlowing = true;
        this.glowIntensity = 1.0;
        this.lastGlowTriggerTime = currentTime;
        
        // 創建震動波（僅桌面端或中等性能以上）
        if (this.performanceMode !== 'low') {
          this.createShockwave();
        }
        
        // 創建光圈漣漪（移動端只創建1個，桌面端創建3個）
        const rippleCount = this.isMobile ? 1 : 3;
        for (let i = 0; i < rippleCount; i++) {
          setTimeout(() => {
            this.createRipple();
          }, i * 100);
        }
        
        console.log('✨ 金色閃光效果觸發！移動步數：', this.verticalMoveCount, '設備：', this.isMobile ? '移動端' : '桌面端');
      }
    }
    
    // 更新金光效果（移動端更快衰減）
    if (this.isGlowing) {
      this.glowPhase += 0.2;
      
      // 移動端加快衰減速度，讓光效更快消失
      const decayRate = this.isMobile ? 0.02 : 0.008;
      this.glowIntensity -= decayRate;
      
      // 閃光結束
      if (this.glowIntensity <= 0) {
        this.isGlowing = false;
        this.glowIntensity = 0;
        this.glowPhase = 0;
        this.verticalMoveCount = 0; // 重置計數器
      }
    }
    
    // 更新銀光效果（移動端更快衰減）
    if (this.isSilverGlowing) {
      this.silverGlowPhase += 0.2;
      
      // 移動端加快衰減速度
      const decayRate = this.isMobile ? 0.02 : 0.008;
      this.silverGlowIntensity -= decayRate;
      
      // 銀光結束
      if (this.silverGlowIntensity <= 0) {
        this.isSilverGlowing = false;
        this.silverGlowIntensity = 0;
        this.silverGlowPhase = 0;
        this.crystalHitCount = 0; // 重置水晶打擊計數
      }
    }
    
    // 控制金光和銀光的重疊時間
    if (this.isGlowing && this.isSilverGlowing) {
      const currentTime = Date.now();
      
      // 記錄兩個光效同時開始的時間
      if (this.bothGlowsStartTime === 0) {
        this.bothGlowsStartTime = currentTime;
        console.log('🌟 金光和銀光同時出現！');
      }
      
      // 檢查是否超過最大重疊時間（隨機3-5秒，這裡用4秒）
      const elapsedTime = currentTime - this.bothGlowsStartTime;
      if (elapsedTime > this.MAX_OVERLAP_TIME) {
        // 隨機選擇結束其中一個光效
        if (Math.random() < 0.5) {
          // 結束金光
          this.isGlowing = false;
          this.glowIntensity = 0;
          this.glowPhase = 0;
          console.log('⚠️ 重疊時間到達，金光消失！');
        } else {
          // 結束銀光
          this.isSilverGlowing = false;
          this.silverGlowIntensity = 0;
          this.silverGlowPhase = 0;
          console.log('⚠️ 重疊時間到達，銀光消失！');
        }
        this.bothGlowsStartTime = 0; // 重置重疊時間
      }
    } else {
      // 如果不是同時存在，重置重疊計時器
      this.bothGlowsStartTime = 0;
    }
    
    // 更新震動波
    this.updateShockwaves();
    
    // 更新拖尾粒子
    this.updateTrailParticles();
    
    // 更新光圈漣漪
    this.updateRipples();
    
    // 處理射擊冷卻
    if (this.shootCooldown > 0) {
      this.shootCooldown--;
    }
    
    // 射擊按鈕持續發射
    if (this.shootButtonPressed && this.shootCooldown === 0) {
      this.shootBullet();
      this.shootCooldown = this.SHOOT_COOLDOWN;
    }
  }

  // 發射子彈
  private shootBullet() {
    this.shootCount++; // 增加射擊計數
    
    // 播放射擊音效
    this.playShootSound();
    
    // 每3次射擊發射愛心，其他時候發射音符
    const bulletType: 'note' | 'heart' = (this.shootCount % 3 === 0) ? 'heart' : 'note';
    
    // 根據類型調整子彈尺寸
    const bulletSize = bulletType === 'heart' ? { width: 20, height: 20 } : { width: 15, height: 20 };
    
    // 隨機顏色生成
    const bulletColor = this.getRandomBulletColor(bulletType);
    
    // 檢測是否同時按下方向鍵+空白鍵（分裂偏射功能）
    const isLeftSplit = this.keys['ArrowLeft'] && this.keys[' '];
    const isRightSplit = this.keys['ArrowRight'] && this.keys[' '];
    
    if (isLeftSplit || isRightSplit) {
      // 分裂成三顆子彈，往指定方向偏射，每顆速率不同
      
      // 根據左右方向設定偏射方向（左偏或右偏）
      const direction = isLeftSplit ? -1 : 1;
      
      // 隨機偏射角度（10度到50度之間，轉換為弧度）
      const minAngle = 10 * Math.PI / 180;
      const maxAngle = 50 * Math.PI / 180;
      
      // 三顆子彈的隨機速度（5-9之間）
      const speed1 = 5 + Math.random() * 4;
      const speed2 = 5 + Math.random() * 4;
      const speed3 = 5 + Math.random() * 4;
      
      // 三顆子彈的隨機角度
      const angle1 = minAngle + Math.random() * (maxAngle - minAngle);
      const angle2 = minAngle + Math.random() * (maxAngle - minAngle);
      const angle3 = minAngle + Math.random() * (maxAngle - minAngle);
      
      // 第一顆子彈
      const velocityX1 = Math.sin(angle1) * speed1 * direction;
      const velocityY1 = -Math.cos(angle1) * speed1;
      
      this.bullets.push({
        x: this.player.x + this.player.width / 2 - bulletSize.width / 2,
        y: this.player.y,
        width: bulletSize.width,
        height: bulletSize.height,
        speed: speed1,
        active: true,
        type: bulletType,
        color: bulletColor,
        velocityX: velocityX1,
        velocityY: velocityY1
      });
      
      // 第二顆子彈（不同速度和角度）
      const bulletColor2 = this.getRandomBulletColor(bulletType);
      const velocityX2 = Math.sin(angle2) * speed2 * direction;
      const velocityY2 = -Math.cos(angle2) * speed2;
      
      this.bullets.push({
        x: this.player.x + this.player.width / 2 - bulletSize.width / 2,
        y: this.player.y,
        width: bulletSize.width,
        height: bulletSize.height,
        speed: speed2,
        active: true,
        type: bulletType,
        color: bulletColor2,
        velocityX: velocityX2,
        velocityY: velocityY2
      });
      
      // 第三顆子彈（不同速度和角度）
      const bulletColor3 = this.getRandomBulletColor(bulletType);
      const velocityX3 = Math.sin(angle3) * speed3 * direction;
      const velocityY3 = -Math.cos(angle3) * speed3;
      
      this.bullets.push({
        x: this.player.x + this.player.width / 2 - bulletSize.width / 2,
        y: this.player.y,
        width: bulletSize.width,
        height: bulletSize.height,
        speed: speed3,
        active: true,
        type: bulletType,
        color: bulletColor3,
        velocityX: velocityX3,
        velocityY: velocityY3
      });
      
      // 輸出提示信息
      const directionText = isLeftSplit ? '左' : '右';
      console.log(`💥 ${directionText}分裂偏射（3顆）！`);
      console.log(`   子彈1 - 角度: ${(angle1 * 180 / Math.PI).toFixed(1)}°, 速度: ${speed1.toFixed(2)}`);
      console.log(`   子彈2 - 角度: ${(angle2 * 180 / Math.PI).toFixed(1)}°, 速度: ${speed2.toFixed(2)}`);
      console.log(`   子彈3 - 角度: ${(angle3 * 180 / Math.PI).toFixed(1)}°, 速度: ${speed3.toFixed(2)}`);
    } else {
      // 普通直線射擊
      this.bullets.push({
        x: this.player.x + this.player.width / 2 - bulletSize.width / 2,
        y: this.player.y,
        width: bulletSize.width,
        height: bulletSize.height,
        speed: 7,
        active: true,
        type: bulletType,
        color: bulletColor,
        velocityX: 0,
        velocityY: -7
      });
      
      // 輸出提示信息
      if (bulletType === 'heart') {
        console.log('❤️ 發射愛心！（第', this.shootCount, '次射擊）顏色：', bulletColor);
      } else {
        console.log('🎵 發射音符！（第', this.shootCount, '次射擊）顏色：', bulletColor);
      }
    }
  }
  
  // 獲取隨機子彈顏色
  private getRandomBulletColor(type: 'note' | 'heart'): string {
    if (type === 'heart') {
      // 愛心的顏色組合（各種粉紅、紅色系）
      const heartColors = [
        '#FF1493', // 深粉紅
        '#FF69B4', // 熱粉紅
        '#FF6B9D', // 桃紅
        '#FFB6C1', // 淺粉紅
        '#FFC0CB', // 粉紅色
        '#FF1744', // 亮紅色
        '#E91E63', // 玫瑰紅
        '#C2185B', // 深玫瑰紅
        '#F50057', // 洋紅色
        '#FF4081', // 亮洋紅
      ];
      return heartColors[Math.floor(Math.random() * heartColors.length)];
    } else {
      // 音符的顏色組合（各種藍紫、紫色系）
      const noteColors = [
        '#8A2BE2', // 藍紫色
        '#9370DB', // 中紫色
        '#9932CC', // 深蘭花紫
        '#BA55D3', // 中蘭花紫
        '#DA70D6', // 蘭花紫
        '#6A5ACD', // 石板藍
        '#7B68EE', // 中石板藍
        '#6495ED', // 矢車菊藍
        '#4169E1', // 皇室藍
        '#00CED1', // 深綠松石色
        '#20B2AA', // 淺海洋綠
        '#48D1CC', // 中綠松石色
      ];
      return noteColors[Math.floor(Math.random() * noteColors.length)];
    }
  }

  // 更新子彈
  private updateBullets() {
    this.bullets = this.bullets.filter(bullet => {
      // 如果有設定速度向量，則使用向量移動；否則直線向上
      if (bullet.velocityX !== undefined && bullet.velocityY !== undefined) {
        bullet.x += bullet.velocityX;
        bullet.y += bullet.velocityY;
      } else {
        bullet.y -= bullet.speed!;
      }
      
      // 檢查子彈是否還在畫面內
      const inBounds = bullet.y > -bullet.height && 
                       bullet.y < this.CANVAS_HEIGHT + bullet.height &&
                       bullet.x > -bullet.width && 
                       bullet.x < this.CANVAS_WIDTH + bullet.width;
      
      return inBounds && bullet.active;
    });
  }

  // 生成敵機（礦石/水晶）
  private spawnEnemies() {
    this.enemySpawnTimer++;
    if (this.enemySpawnTimer >= this.ENEMY_SPAWN_INTERVAL) {
      this.enemySpawnTimer = 0;
      
      // 80% 機率生成礦石，20% 機率生成水晶
      const isCrystal = Math.random() < 0.2;
      const enemyType: 'mineral' | 'crystal' = isCrystal ? 'crystal' : 'mineral';
      
      // 根據類型選擇顏色
      const enemyColor = this.getRandomEnemyColor(enemyType);
      
      // 隨機選擇形狀變化（0-2）
      const enemyShape = Math.floor(Math.random() * 3);
      
      const enemy: Enemy = {
        x: Math.random() * (this.CANVAS_WIDTH - 35),
        y: -50,
        width: 30,
        height: 35,
        speed: 2 + Math.random() * 2,
        active: true,
        type: enemyType,
        color: enemyColor,
        shape: enemyShape,
        glowPhase: isCrystal ? Math.random() * Math.PI * 2 : 0 // 水晶隨機初始閃爍相位
      };
      
      this.enemies.push(enemy);
      
      // 輸出提示信息
      const typeText = isCrystal ? '💎 水晶' : '⛰️ 礦石';
      console.log(`${typeText} 生成！形狀: ${enemyShape}, 顏色: ${enemyColor}`);
    }
  }
  
  // 獲取隨機敵機顏色
  private getRandomEnemyColor(type: 'mineral' | 'crystal'): string {
    if (type === 'crystal') {
      // 水晶的顏色組合（透明感的亮色）
      const crystalColors = [
        '#00FFFF', // 青色水晶
        '#00E5FF', // 亮青色
        '#00BCD4', // 青綠色
        '#FF00FF', // 洋紅水晶
        '#E040FB', // 紫色水晶
        '#7C4DFF', // 深紫色水晶
        '#00E676', // 綠色水晶
        '#76FF03', // 亮綠色水晶
        '#FFEA00', // 黃色水晶
        '#FFC400', // 金色水晶
      ];
      return crystalColors[Math.floor(Math.random() * crystalColors.length)];
    } else {
      // 礦石的顏色組合（深沉的大地色）
      const mineralColors = [
        '#8D6E63', // 褐色礦石
        '#A1887F', // 淺褐色
        '#795548', // 深褐色
        '#6D4C41', // 咖啡色
        '#5D4037', // 暗咖啡色
        '#757575', // 灰色礦石
        '#616161', // 深灰色
        '#9E9E9E', // 淺灰色
        '#78909C', // 藍灰色
        '#546E7A', // 深藍灰色
        '#B0BEC5', // 淺藍灰色
        '#90A4AE', // 銀灰色
      ];
      return mineralColors[Math.floor(Math.random() * mineralColors.length)];
    }
  }

  // 更新敵機
  private updateEnemies() {
    this.enemies = this.enemies.filter(enemy => {
      enemy.y += enemy.speed!;
      
      // 更新水晶的閃爍相位
      if (enemy.type === 'crystal' && enemy.glowPhase !== undefined) {
        enemy.glowPhase += 0.15; // 閃爍速度
      }
      
      return enemy.y < this.CANVAS_HEIGHT && enemy.active;
    });
  }

  // 碰撞檢測
  private checkCollisions() {
    // 檢測子彈與敵機的碰撞
    this.bullets.forEach(bullet => {
      this.enemies.forEach(enemy => {
        if (bullet.active && enemy.active && this.isColliding(bullet, enemy)) {
          bullet.active = false;
          enemy.active = false;
          this.score += 10;
          
          // 如果打到的是水晶，增加連續打擊計數
          if (enemy.type === 'crystal') {
            const currentTime = Date.now();
            
            // 檢查是否在超時時間內
            if (currentTime - this.lastHitTime < this.CRYSTAL_HIT_TIMEOUT) {
              this.crystalHitCount++;
            } else {
              // 超時，重置計數
              this.crystalHitCount = 1;
            }
            
            this.lastHitTime = currentTime;
            
            // 當連續打擊達到閾值時，觸發銀光效果
            if (this.crystalHitCount >= this.CRYSTAL_HIT_THRESHOLD) {
              this.isSilverGlowing = true;
              this.silverGlowIntensity = 1.0;
              
              console.log('✨ 銀色閃光效果觸發！連續打擊水晶：', this.crystalHitCount);
            }
          }
        }
      });
    });

    // 檢測玩家與敵機的碰撞
    this.enemies.forEach(enemy => {
      if (enemy.active && this.isColliding(this.player, enemy)) {
        enemy.active = false; // 敵機消失
        this.playerHit(); // 玩家受傷
      }
    });
  }

  // 判斷兩個物體是否碰撞
  private isColliding(obj1: GameObject, obj2: GameObject): boolean {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
  }

  // 玩家受傷（減少一條命）
  private playerHit() {
    this.lives--;
    console.log(`💥 玩家被擊中！剩餘生命: ${this.lives} 🍚`);
    
    // 播放受傷音效（可以添加）
    // this.playHitSound();
    
    // 如果生命用完才結束遊戲
    if (this.lives <= 0) {
      this.endGame();
    }
  }

  // 結束遊戲
  private endGame() {
    this.gameOver = true;
    this.gameStarted = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    // 停止所有音效
    this.stopAllSounds();
    // 停止背景音樂和節拍效果
    this.stopBackgroundMusic();
    if (this.beatInterval) {
      clearInterval(this.beatInterval);
      this.beatInterval = null;
    }
  }

  // 繪製遊戲畫面（根據性能模式優化）
  private draw() {
    // 清空畫布（繪製背景）- 深鐵灰色
    this.ctx.fillStyle = '#2A2E35';
    this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);

    // 繪製演唱會聚光燈（最底層）- 僅高性能和中性能模式
    if (this.performanceMode !== 'low') {
      this.drawSpotlights();
    }

    // 繪製星星背景
    this.drawStars();

    // 繪製激光射線 - 僅高性能模式
    if (this.performanceMode === 'high') {
      this.drawLaserBeams();
    }

    // 繪製光圈漣漪（在最底層）- 僅高性能和中性能模式
    if (this.performanceMode !== 'low') {
      this.drawRipples();
    }

    // 繪製震動波 - 僅高性能模式
    if (this.performanceMode === 'high') {
      this.drawShockwaves();
    }

    // 繪製拖尾粒子 - 僅高性能和中性能模式
    if (this.performanceMode !== 'low') {
      this.drawTrailParticles();
    }

    // 繪製玩家
    this.drawPlayer();

    // 繪製子彈
    this.drawBullets();

    // 繪製敵機
    this.drawEnemies();
    
    // 繪製頻閃效果（最上層）- 僅高性能模式
    if (this.performanceMode === 'high') {
      this.drawFlashEffect();
    }
  }

  // 繪製星星背景（根據性能模式調整）
  private drawStars() {
    // 根據性能模式調整星星數量
    const starCount = this.performanceMode === 'low' ? 20 : 
                      this.performanceMode === 'medium' ? 30 : 50;
    
    this.ctx.fillStyle = '#ffffff';
    for (let i = 0; i < starCount; i++) {
      const x = (i * 37) % this.CANVAS_WIDTH;
      const y = (i * 59 + Date.now() * 0.05) % this.CANVAS_HEIGHT;
      this.ctx.fillRect(x, y, 2, 2);
    }
  }

  // 繪製玩家電吉他（根據性能模式優化）
  private drawPlayer() {
    const { x, y, width, height } = this.player;
    const centerX = x + width / 2;
    
    // 繪製金色閃光效果（在吉他下層）
    if (this.isGlowing && this.glowIntensity > 0) {
      this.drawGoldenGlow(centerX, y + height / 2);
    }
    
    // 繪製銀色閃光效果（在吉他下層）
    if (this.isSilverGlowing && this.silverGlowIntensity > 0) {
      this.drawSilverGlow(centerX, y + height / 2);
    }
    
    // 低性能模式使用簡化繪製
    if (this.performanceMode === 'low') {
      this.drawPlayerSimple(x, y, width, height, centerX);
      return;
    }
    
    // ============ 電吉他琴身 - 液態金屬風格 ============
    const bodyStartY = y + height * 0.4;
    const bodyWidth = width * 0.9;
    const bodyHeight = height * 0.5;
    
    // 琴身陰影效果
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowOffsetX = 3;
    this.ctx.shadowOffsetY = 3;
    
    // 琴身主體 - 液態金屬銀色漸變
    const bodyGradient = this.ctx.createLinearGradient(
      centerX - bodyWidth * 0.5, bodyStartY,
      centerX + bodyWidth * 0.5, bodyStartY + bodyHeight
    );
    bodyGradient.addColorStop(0, '#E8E8E8');    // 亮銀色
    bodyGradient.addColorStop(0.2, '#FFFFFF');  // 白色高光
    bodyGradient.addColorStop(0.4, '#C0C0C0');  // 銀色
    bodyGradient.addColorStop(0.6, '#A8A8A8');  // 深銀色
    bodyGradient.addColorStop(0.8, '#D0D0D0');  // 中銀色
    bodyGradient.addColorStop(1, '#B8B8B8');    // 淺灰銀
    
    this.ctx.fillStyle = bodyGradient;
    this.ctx.beginPath();
    
    // 上角（左側圓角）
    this.ctx.moveTo(centerX - bodyWidth * 0.3, bodyStartY);
    this.ctx.bezierCurveTo(
      centerX - bodyWidth * 0.45, bodyStartY,
      centerX - bodyWidth * 0.5, bodyStartY + bodyHeight * 0.15,
      centerX - bodyWidth * 0.5, bodyStartY + bodyHeight * 0.3
    );
    
    // 左側腰身內凹
    this.ctx.bezierCurveTo(
      centerX - bodyWidth * 0.5, bodyStartY + bodyHeight * 0.45,
      centerX - bodyWidth * 0.35, bodyStartY + bodyHeight * 0.5,
      centerX - bodyWidth * 0.35, bodyStartY + bodyHeight * 0.65
    );
    
    // 左下角
    this.ctx.bezierCurveTo(
      centerX - bodyWidth * 0.35, bodyStartY + bodyHeight * 0.85,
      centerX - bodyWidth * 0.25, bodyStartY + bodyHeight,
      centerX, bodyStartY + bodyHeight
    );
    
    // 右下角
    this.ctx.bezierCurveTo(
      centerX + bodyWidth * 0.25, bodyStartY + bodyHeight,
      centerX + bodyWidth * 0.4, bodyStartY + bodyHeight * 0.85,
      centerX + bodyWidth * 0.45, bodyStartY + bodyHeight * 0.65
    );
    
    // 右側腰身內凹
    this.ctx.bezierCurveTo(
      centerX + bodyWidth * 0.45, bodyStartY + bodyHeight * 0.5,
      centerX + bodyWidth * 0.35, bodyStartY + bodyHeight * 0.4,
      centerX + bodyWidth * 0.45, bodyStartY + bodyHeight * 0.25
    );
    
    // 右上角
    this.ctx.bezierCurveTo(
      centerX + bodyWidth * 0.48, bodyStartY + bodyHeight * 0.15,
      centerX + bodyWidth * 0.4, bodyStartY,
      centerX + bodyWidth * 0.25, bodyStartY
    );
    
    this.ctx.closePath();
    this.ctx.fill();
    
    // 取消陰影
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
    
    // 琴身液態金屬邊緣高光
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    this.ctx.lineWidth = 2.5;
    this.ctx.stroke();
    
    // 液態金屬流動效果（波浪紋理）
    const liquidGradient = this.ctx.createRadialGradient(
      centerX - bodyWidth * 0.2, bodyStartY + bodyHeight * 0.3, 0,
      centerX, bodyStartY + bodyHeight * 0.5, bodyWidth * 0.5
    );
    liquidGradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)'); // 亮點
    liquidGradient.addColorStop(0.3, 'rgba(224, 224, 224, 0.3)');
    liquidGradient.addColorStop(0.6, 'rgba(192, 192, 192, 0.2)');
    liquidGradient.addColorStop(1, 'rgba(160, 160, 160, 0)');
    
    this.ctx.fillStyle = liquidGradient;
    this.ctx.beginPath();
    // 液態波紋效果
    for (let i = 0; i < 4; i++) {
      const waveX = centerX - bodyWidth * 0.25 + i * bodyWidth * 0.15;
      const waveY = bodyStartY + bodyHeight * 0.25;
      this.ctx.moveTo(waveX, waveY);
      this.ctx.bezierCurveTo(
        waveX - 3, waveY + 12,
        waveX + 5, waveY + 22,
        waveX - 2, waveY + 35
      );
      this.ctx.bezierCurveTo(
        waveX + 4, waveY + 48,
        waveX - 5, waveY + 58,
        waveX + 1, waveY + 70
      );
    }
    this.ctx.fill();
    
    // 額外的液態高光點
    const highlights = [
      { x: centerX - bodyWidth * 0.25, y: bodyStartY + bodyHeight * 0.2, size: 15 },
      { x: centerX + bodyWidth * 0.15, y: bodyStartY + bodyHeight * 0.35, size: 20 },
      { x: centerX - bodyWidth * 0.1, y: bodyStartY + bodyHeight * 0.55, size: 12 },
      { x: centerX + bodyWidth * 0.25, y: bodyStartY + bodyHeight * 0.7, size: 10 }
    ];
    
    highlights.forEach(hl => {
      const hlGradient = this.ctx.createRadialGradient(hl.x, hl.y, 0, hl.x, hl.y, hl.size);
      hlGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
      hlGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
      hlGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      this.ctx.fillStyle = hlGradient;
      this.ctx.beginPath();
      this.ctx.arc(hl.x, hl.y, hl.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    
    // 拾音器（三個金屬長方形 - 銀色主題）
    const pickupY1 = bodyStartY + bodyHeight * 0.25;
    const pickupY2 = bodyStartY + bodyHeight * 0.45;
    const pickupY3 = bodyStartY + bodyHeight * 0.65;
    const pickupWidth = width * 0.4;
    const pickupHeight = 4;
    
    // 繪製拾音器
    [pickupY1, pickupY2, pickupY3].forEach((py) => {
      // 拾音器外殼漸變
      const pickupGradient = this.ctx.createLinearGradient(
        centerX - pickupWidth / 2, py,
        centerX + pickupWidth / 2, py
      );
      pickupGradient.addColorStop(0, '#4A4A4A');
      pickupGradient.addColorStop(0.5, '#2C2C2C');
      pickupGradient.addColorStop(1, '#4A4A4A');
      
      this.ctx.fillStyle = pickupGradient;
      this.ctx.fillRect(centerX - pickupWidth / 2, py, pickupWidth, pickupHeight);
      
      // 拾音器邊緣高光
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      this.ctx.lineWidth = 0.5;
      this.ctx.strokeRect(centerX - pickupWidth / 2, py, pickupWidth, pickupHeight);
      
      // 拾音器磁極（6個銀色小點）
      this.ctx.fillStyle = '#E0E0E0'; // 亮銀色
      for (let i = 0; i < 6; i++) {
        const poleX = centerX - pickupWidth / 2 + (i + 0.5) * (pickupWidth / 6);
        this.ctx.beginPath();
        this.ctx.arc(poleX, py + pickupHeight / 2, 1.2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 磁極高光
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(poleX - 0.3, py + pickupHeight / 2 - 0.3, 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#E0E0E0';
      }
    });
    
    // 控制旋鈕（音量/音色 - 銀色金屬）
    const knobY = bodyStartY + bodyHeight * 0.85;
    const knobPositions = [
      centerX - bodyWidth * 0.25,
      centerX - bodyWidth * 0.1,
      centerX + bodyWidth * 0.1
    ];
    
    knobPositions.forEach((knobX) => {
      // 旋鈕金屬漸變
      const knobGradient = this.ctx.createRadialGradient(
        knobX - 1, knobY - 1, 0,
        knobX, knobY, 4
      );
      knobGradient.addColorStop(0, '#FFFFFF');
      knobGradient.addColorStop(0.4, '#D0D0D0');
      knobGradient.addColorStop(0.7, '#A0A0A0');
      knobGradient.addColorStop(1, '#808080');
      
      this.ctx.fillStyle = knobGradient;
      this.ctx.beginPath();
      this.ctx.arc(knobX, knobY, 4, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 旋鈕邊緣
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.lineWidth = 0.5;
      this.ctx.stroke();
      
      // 旋鈕中心
      this.ctx.fillStyle = '#1C1C1C';
      this.ctx.beginPath();
      this.ctx.arc(knobX, knobY, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 旋鈕指示線（白色）
      this.ctx.strokeStyle = '#FFFFFF';
      this.ctx.lineWidth = 0.8;
      this.ctx.beginPath();
      this.ctx.moveTo(knobX, knobY);
      this.ctx.lineTo(knobX + 2, knobY - 2);
      this.ctx.stroke();
    });
    
    // ============ 琴頸（銀灰色金屬）============
    const neckWidth = width * 0.22;
    const neckHeight = height * 0.4;
    
    // 琴頸主體 - 金屬灰色
    const neckBaseGradient = this.ctx.createLinearGradient(
      centerX - neckWidth / 2, y,
      centerX + neckWidth / 2, y
    );
    neckBaseGradient.addColorStop(0, '#6A6A6A');
    neckBaseGradient.addColorStop(0.5, '#8A8A8A');
    neckBaseGradient.addColorStop(1, '#6A6A6A');
    
    this.ctx.fillStyle = neckBaseGradient;
    this.ctx.fillRect(centerX - neckWidth / 2, y, neckWidth, neckHeight);
    
    // 琴頸側面立體感（更強的液態金屬感）
    const neckGradient = this.ctx.createLinearGradient(
      centerX - neckWidth / 2, y,
      centerX + neckWidth / 2, y
    );
    neckGradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
    neckGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.2)');
    neckGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    neckGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
    neckGradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    this.ctx.fillStyle = neckGradient;
    this.ctx.fillRect(centerX - neckWidth / 2, y, neckWidth, neckHeight);
    
    // 琴格（品格線 - 金屬感）
    this.ctx.strokeStyle = '#B8B8B8';
    this.ctx.lineWidth = 1.2;
    for (let i = 1; i <= 5; i++) {
      const fretY = y + height * 0.05 + i * (neckHeight - height * 0.05) / 6;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - neckWidth / 2, fretY);
      this.ctx.lineTo(centerX + neckWidth / 2, fretY);
      this.ctx.stroke();
    }
    
    // 琴弦（6條銀色細線）
    this.ctx.strokeStyle = '#E8E8E8';
    this.ctx.lineWidth = 0.8;
    const stringCount = 6;
    const stringSpacing = neckWidth / (stringCount + 1);
    
    for (let i = 1; i <= stringCount; i++) {
      const stringX = centerX - neckWidth / 2 + i * stringSpacing;
      this.ctx.beginPath();
      this.ctx.moveTo(stringX, y + height * 0.05);
      this.ctx.lineTo(stringX, bodyStartY + bodyHeight * 0.95);
      this.ctx.stroke();
      
      // 弦的高光
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 0.3;
      this.ctx.stroke();
      this.ctx.strokeStyle = '#E8E8E8';
      this.ctx.lineWidth = 0.8;
    }
    
    // ============ 琴頭（單邊設計 - 不像蝸牛！）============
    const headWidth = neckWidth * 0.9; // 單邊所以較窄
    const headHeight = height * 0.08;
    
    // 琴頭液態銀色漸變
    const headGradient = this.ctx.createLinearGradient(
      centerX - neckWidth / 2, y,
      centerX + headWidth, y + headHeight
    );
    headGradient.addColorStop(0, '#B0B0B0');
    headGradient.addColorStop(0.3, '#D8D8D8');
    headGradient.addColorStop(0.6, '#C0C0C0');
    headGradient.addColorStop(1, '#A0A0A0');
    
    this.ctx.fillStyle = headGradient;
    this.ctx.beginPath();
    
    // 單邊琴頭設計（只向左延伸）
    this.ctx.moveTo(centerX - neckWidth / 2, y + headHeight);
    this.ctx.lineTo(centerX - headWidth, y + headHeight * 0.5);
    
    // 左側圓滑曲線
    this.ctx.bezierCurveTo(
      centerX - headWidth * 1.1, y + headHeight * 0.3,
      centerX - headWidth * 1.1, y,
      centerX - headWidth * 0.8, y
    );
    
    // 頂部流線
    this.ctx.bezierCurveTo(
      centerX - neckWidth * 0.3, y,
      centerX, y,
      centerX + neckWidth / 2, y + headHeight * 0.2
    );
    
    // 右側直接接琴頸
    this.ctx.lineTo(centerX + neckWidth / 2, y + headHeight);
    
    this.ctx.closePath();
    this.ctx.fill();
    
    // 琴頭液態金屬邊緣高光
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    
    // 琴頭內部液態光澤
    const headHighlight = this.ctx.createRadialGradient(
      centerX - headWidth * 0.6, y + headHeight * 0.3, 0,
      centerX - headWidth * 0.6, y + headHeight * 0.3, headWidth * 0.5
    );
    headHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    headHighlight.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    headHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    this.ctx.fillStyle = headHighlight;
    this.ctx.beginPath();
    this.ctx.ellipse(centerX - headWidth * 0.6, y + headHeight * 0.3, 
                     headWidth * 0.4, headHeight * 0.35, 0, 0, Math.PI * 2);
    this.ctx.fill();
    
    // 弦鈕（金屬調音旋鈕）- 只在左側，6個排成一列
    for (let i = 0; i < 6; i++) {
      const tunerY = y + headHeight * 0.15 + i * headHeight * 0.12;
      const tunerX = centerX - headWidth * 0.8;
      
      // 弦鈕金屬漸變
      const tunerGradient = this.ctx.createRadialGradient(
        tunerX - 0.5, tunerY - 0.5, 0,
        tunerX, tunerY, 2.5
      );
      tunerGradient.addColorStop(0, '#FFFFFF');
      tunerGradient.addColorStop(0.5, '#E0E0E0');
      tunerGradient.addColorStop(1, '#C0C0C0');
      
      this.ctx.fillStyle = tunerGradient;
      this.ctx.beginPath();
      this.ctx.arc(tunerX, tunerY, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 弦鈕邊緣
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      this.ctx.lineWidth = 0.5;
      this.ctx.stroke();
      
      // 弦鈕高光
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.beginPath();
      this.ctx.arc(tunerX - 0.7, tunerY - 0.7, 0.8, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // 琴橋（液態銀色金屬搖座）
    const bridgeY = bodyStartY + bodyHeight * 0.95;
    const bridgeWidth = width * 0.35;
    
    // 琴橋底座漸變
    const bridgeGradient = this.ctx.createLinearGradient(
      centerX - bridgeWidth / 2, bridgeY - 2,
      centerX + bridgeWidth / 2, bridgeY + 2
    );
    bridgeGradient.addColorStop(0, '#A0A0A0');
    bridgeGradient.addColorStop(0.5, '#D0D0D0');
    bridgeGradient.addColorStop(1, '#A0A0A0');
    
    this.ctx.fillStyle = bridgeGradient;
    this.ctx.fillRect(centerX - bridgeWidth / 2, bridgeY - 2, bridgeWidth, 4);
    
    // 琴橋高光
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.lineWidth = 0.5;
    this.ctx.strokeRect(centerX - bridgeWidth / 2, bridgeY - 2, bridgeWidth, 4);
    
    // 琴橋細節（弦座）
    for (let i = 0; i < 6; i++) {
      const saddle = centerX - bridgeWidth / 2 + (i + 0.5) * (bridgeWidth / 6);
      
      // 弦座漸變
      const saddleGradient = this.ctx.createRadialGradient(
        saddle - 0.5, bridgeY - 0.5, 0,
        saddle, bridgeY, 1.5
      );
      saddleGradient.addColorStop(0, '#E0E0E0');
      saddleGradient.addColorStop(1, '#909090');
      
      this.ctx.fillStyle = saddleGradient;
      this.ctx.beginPath();
      this.ctx.arc(saddle, bridgeY, 1.5, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  // 繪製金色閃光效果（移動端最多5圈，桌面端更多）
  private drawGoldenGlow(centerX: number, centerY: number) {
    const baseRadius = 40;
    const maxRadius = 80;
    
    // 計算脈動半徑（更平滑的脈動）
    const pulse = Math.sin(this.glowPhase) * 0.25 + 0.75; // 0.5 - 1.0 之間脈動
    const currentRadius = baseRadius + (maxRadius - baseRadius) * (1 - this.glowIntensity);
    
    // 移動端最多5層，桌面端根據性能模式
    const layerCount = this.isMobile ? 
                       Math.min(4, this.performanceMode === 'low' ? 3 : 4) : // 移動端：3-4層
                       (this.performanceMode === 'low' ? 3 : 
                        this.performanceMode === 'medium' ? 5 : 6); // 桌面端：3-6層
    
    // 繪製多層光暈
    for (let i = layerCount; i >= 0; i--) {
      const layerRadius = currentRadius * pulse * (1 + i * 0.18);
      const layerAlpha = this.glowIntensity * 0.2 * (1 - i * 0.12);
      
      // 金色漸變光暈（更豐富的顏色）
      const gradient = this.ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, layerRadius
      );
      
      gradient.addColorStop(0, `rgba(255, 255, 255, ${layerAlpha * 0.9})`); // 白色中心
      gradient.addColorStop(0.2, `rgba(255, 235, 59, ${layerAlpha * 0.8})`); // 亮金色
      gradient.addColorStop(0.4, `rgba(255, 215, 0, ${layerAlpha * 0.7})`); // 金色
      gradient.addColorStop(0.6, `rgba(255, 193, 7, ${layerAlpha * 0.5})`); // 深金色
      gradient.addColorStop(0.8, `rgba(255, 152, 0, ${layerAlpha * 0.3})`); // 橙金色
      gradient.addColorStop(1, 'rgba(255, 215, 0, 0)'); // 透明
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, layerRadius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // 繪製旋轉的閃光粒子（移動端減少數量）
    const particleCount = this.isMobile ? 
                          (this.performanceMode === 'low' ? 4 : 6) : // 移動端：4-6個
                          (this.performanceMode === 'low' ? 6 : 
                           this.performanceMode === 'medium' ? 8 : 12); // 桌面端：6-12個
    for (let i = 0; i < particleCount; i++) {
      const angle = (this.glowPhase * 1.5 + (i * Math.PI * 2) / particleCount);
      const distance = baseRadius * pulse * 1.3;
      const px = centerX + Math.cos(angle) * distance;
      const py = centerY + Math.sin(angle) * distance;
      const particleSize = 4 * this.glowIntensity;
      
      // 金色粒子核心
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.glowIntensity * 0.9})`;
      this.ctx.beginPath();
      this.ctx.arc(px, py, particleSize * 0.6, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 金色粒子
      this.ctx.fillStyle = `rgba(255, 215, 0, ${this.glowIntensity * 0.8})`;
      this.ctx.beginPath();
      this.ctx.arc(px, py, particleSize, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 粒子光暈
      const particleGradient = this.ctx.createRadialGradient(px, py, 0, px, py, particleSize * 3);
      particleGradient.addColorStop(0, `rgba(255, 235, 59, ${this.glowIntensity * 0.6})`);
      particleGradient.addColorStop(0.5, `rgba(255, 193, 7, ${this.glowIntensity * 0.3})`);
      particleGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
      this.ctx.fillStyle = particleGradient;
      this.ctx.beginPath();
      this.ctx.arc(px, py, particleSize * 3, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // 添加外圈星光效果（僅高性能模式）
    if (this.performanceMode !== 'high') return;
    
    const starCount = 8;
    for (let i = 0; i < starCount; i++) {
      const angle = (this.glowPhase * 2 + (i * Math.PI * 2) / starCount);
      const distance = currentRadius * pulse * 1.1;
      const sx = centerX + Math.cos(angle) * distance;
      const sy = centerY + Math.sin(angle) * distance;
      
      // 繪製星光射線
      this.ctx.strokeStyle = `rgba(255, 235, 59, ${this.glowIntensity * 0.5})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(sx, sy);
      this.ctx.stroke();
    }
  }

  // 繪製銀色閃光效果（移動端最多5圈）
  private drawSilverGlow(centerX: number, centerY: number) {
    const baseRadius = 40;
    const maxRadius = 80;
    
    // 計算脈動半徑（更平滑的脈動）
    const pulse = Math.sin(this.silverGlowPhase) * 0.25 + 0.75; // 0.5 - 1.0 之間脈動
    const currentRadius = baseRadius + (maxRadius - baseRadius) * (1 - this.silverGlowIntensity);
    
    // 移動端最多5層，桌面端根據性能模式
    const layerCount = this.isMobile ? 
                       Math.min(4, this.performanceMode === 'low' ? 3 : 4) : // 移動端：3-4層
                       (this.performanceMode === 'low' ? 3 : 
                        this.performanceMode === 'medium' ? 5 : 6); // 桌面端：3-6層
    
    // 繪製多層銀光光暈
    for (let i = layerCount; i >= 0; i--) {
      const layerRadius = currentRadius * pulse * (1 + i * 0.18);
      const layerAlpha = this.silverGlowIntensity * 0.2 * (1 - i * 0.12);
      
      // 銀色漸變光暈（更豐富的銀色）
      const gradient = this.ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, layerRadius
      );
      
      gradient.addColorStop(0, `rgba(255, 255, 255, ${layerAlpha * 0.9})`); // 白色中心
      gradient.addColorStop(0.2, `rgba(230, 230, 250, ${layerAlpha * 0.8})`); // 淡紫銀色
      gradient.addColorStop(0.4, `rgba(192, 192, 192, ${layerAlpha * 0.7})`); // 銀色
      gradient.addColorStop(0.6, `rgba(169, 169, 169, ${layerAlpha * 0.5})`); // 深銀色
      gradient.addColorStop(0.8, `rgba(211, 211, 211, ${layerAlpha * 0.3})`); // 淺銀色
      gradient.addColorStop(1, 'rgba(192, 192, 192, 0)'); // 透明
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, layerRadius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // 繪製旋轉的銀色粒子（移動端減少數量）
    const particleCount = this.isMobile ? 
                          (this.performanceMode === 'low' ? 4 : 6) : // 移動端：4-6個
                          (this.performanceMode === 'low' ? 6 : 
                           this.performanceMode === 'medium' ? 8 : 12); // 桌面端：6-12個
    for (let i = 0; i < particleCount; i++) {
      const angle = (-this.silverGlowPhase * 1.5 + (i * Math.PI * 2) / particleCount); // 反方向旋轉
      const distance = baseRadius * pulse * 1.3;
      const px = centerX + Math.cos(angle) * distance;
      const py = centerY + Math.sin(angle) * distance;
      const particleSize = 4 * this.silverGlowIntensity;
      
      // 銀色粒子核心
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.silverGlowIntensity * 0.9})`;
      this.ctx.beginPath();
      this.ctx.arc(px, py, particleSize * 0.6, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 銀色粒子
      this.ctx.fillStyle = `rgba(192, 192, 192, ${this.silverGlowIntensity * 0.8})`;
      this.ctx.beginPath();
      this.ctx.arc(px, py, particleSize, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 粒子光暈
      const particleGradient = this.ctx.createRadialGradient(px, py, 0, px, py, particleSize * 3);
      particleGradient.addColorStop(0, `rgba(230, 230, 250, ${this.silverGlowIntensity * 0.6})`);
      particleGradient.addColorStop(0.5, `rgba(211, 211, 211, ${this.silverGlowIntensity * 0.3})`);
      particleGradient.addColorStop(1, 'rgba(192, 192, 192, 0)');
      this.ctx.fillStyle = particleGradient;
      this.ctx.beginPath();
      this.ctx.arc(px, py, particleSize * 3, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // 添加外圈銀色星光效果（菱形形狀）
    const starCount = 8;
    for (let i = 0; i < starCount; i++) {
      const angle = (-this.silverGlowPhase * 2 + (i * Math.PI * 2) / starCount); // 反方向旋轉
      const distance = currentRadius * pulse * 1.1;
      const sx = centerX + Math.cos(angle) * distance;
      const sy = centerY + Math.sin(angle) * distance;
      
      // 繪製銀色星光射線
      this.ctx.strokeStyle = `rgba(230, 230, 250, ${this.silverGlowIntensity * 0.5})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(sx, sy);
      this.ctx.stroke();
    }
    
    // 添加額外的閃爍水晶光點效果（僅高性能模式）
    if (this.performanceMode !== 'high') return;
    
    const crystalSparkles = 6;
    for (let i = 0; i < crystalSparkles; i++) {
      const angle = (this.silverGlowPhase * 3 + (i * Math.PI * 2) / crystalSparkles);
      const distance = currentRadius * pulse * 0.7;
      const sparkleX = centerX + Math.cos(angle) * distance;
      const sparkleY = centerY + Math.sin(angle) * distance;
      const sparkleSize = 3 * this.silverGlowIntensity;
      
      // 水晶閃光核心
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.silverGlowIntensity * 0.95})`;
      this.ctx.beginPath();
      this.ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 閃光光暈
      const sparkleGradient = this.ctx.createRadialGradient(
        sparkleX, sparkleY, 0,
        sparkleX, sparkleY, sparkleSize * 4
      );
      sparkleGradient.addColorStop(0, `rgba(173, 216, 230, ${this.silverGlowIntensity * 0.7})`); // 淡藍銀
      sparkleGradient.addColorStop(0.5, `rgba(192, 192, 192, ${this.silverGlowIntensity * 0.4})`);
      sparkleGradient.addColorStop(1, 'rgba(192, 192, 192, 0)');
      this.ctx.fillStyle = sparkleGradient;
      this.ctx.beginPath();
      this.ctx.arc(sparkleX, sparkleY, sparkleSize * 4, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  // 繪製子彈
  private drawBullets() {
    this.bullets.forEach(bullet => {
      if (bullet.active) {
        const centerX = bullet.x + bullet.width / 2;
        const centerY = bullet.y + bullet.height / 2;
        
        if (bullet.type === 'heart') {
          this.drawHeart(centerX, centerY, bullet.width * 0.5, bullet.color);
        } else {
          this.drawMusicNote(centerX, centerY, bullet.height * 0.8, bullet.color);
        }
      }
    });
  }
  
  // 繪製愛心
  private drawHeart(x: number, y: number, size: number, color: string) {
    this.ctx.save();
    this.ctx.translate(x, y);
    
    // 將十六進制顏色轉換為 RGB
    const rgb = this.hexToRgb(color);
    
    // 繪製愛心光暈
    const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2);
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`);
    gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`);
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, size * 2, 0, Math.PI * 2);
    this.ctx.fill();
    
    // 繪製愛心主體
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    
    // 愛心路徑
    const topCurveHeight = size * 0.3;
    this.ctx.moveTo(0, topCurveHeight);
    
    // 左半邊
    this.ctx.bezierCurveTo(
      -size, -size * 0.3,
      -size, size * 0.5,
      0, size
    );
    
    // 右半邊
    this.ctx.bezierCurveTo(
      size, size * 0.5,
      size, -size * 0.3,
      0, topCurveHeight
    );
    
    this.ctx.closePath();
    this.ctx.fill();
    
    // 添加高光效果
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    this.ctx.beginPath();
    this.ctx.ellipse(-size * 0.3, 0, size * 0.25, size * 0.35, -0.3, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
  }
  
  // 繪製音符
  private drawMusicNote(x: number, y: number, size: number, color: string) {
    this.ctx.save();
    this.ctx.translate(x, y);
    
    // 將十六進制顏色轉換為 RGB
    const rgb = this.hexToRgb(color);
    
    // 繪製音符光暈
    const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.8);
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`);
    gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`);
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
    this.ctx.fill();
    
    // 音符顏色
    this.ctx.fillStyle = color;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = size * 0.08;
    
    // 繪製音符符頭（橢圓）
    const noteHeadWidth = size * 0.25;
    const noteHeadHeight = size * 0.2;
    const noteHeadY = size * 0.25;
    
    this.ctx.beginPath();
    this.ctx.ellipse(0, noteHeadY, noteHeadWidth, noteHeadHeight, -0.3, 0, Math.PI * 2);
    this.ctx.fill();
    
    // 繪製音符符桿
    const stemX = noteHeadWidth * 0.7;
    const stemTop = -size * 0.35;
    
    this.ctx.beginPath();
    this.ctx.moveTo(stemX, noteHeadY);
    this.ctx.lineTo(stemX, stemTop);
    this.ctx.stroke();
    
    // 繪製音符符尾（旗幟）
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(stemX, stemTop);
    this.ctx.bezierCurveTo(
      stemX + size * 0.3, stemTop + size * 0.1,
      stemX + size * 0.25, stemTop + size * 0.2,
      stemX, stemTop + size * 0.25
    );
    this.ctx.fill();
    
    // 添加閃光效果
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.beginPath();
    this.ctx.arc(-noteHeadWidth * 0.3, noteHeadY - noteHeadHeight * 0.3, size * 0.06, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
  }

  // 繪製敵機（礦石/水晶）
  private drawEnemies() {
    this.enemies.forEach(enemy => {
      if (enemy.active) {
        if (enemy.type === 'crystal') {
          this.drawCrystal(enemy);
        } else {
          this.drawMineral(enemy);
        }
      }
    });
  }
  
  // 繪製礦石（不規則多邊形，深沉顏色）
  private drawMineral(enemy: Enemy) {
    const { x, y, width, height, color, shape } = enemy;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    this.ctx.save();
    
    // 礦石陰影
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    this.ctx.shadowBlur = 8;
    this.ctx.shadowOffsetX = 3;
    this.ctx.shadowOffsetY = 3;
    
    // 根據形狀選擇不同的礦石樣式
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    
    if (shape === 0) {
      // 方形礦石（不規則）
      this.ctx.moveTo(x + width * 0.1, y + height * 0.2);
      this.ctx.lineTo(x + width * 0.9, y + height * 0.15);
      this.ctx.lineTo(x + width * 0.95, y + height * 0.8);
      this.ctx.lineTo(x + width * 0.5, y + height * 0.95);
      this.ctx.lineTo(x + width * 0.05, y + height * 0.75);
    } else if (shape === 1) {
      // 菱形礦石
      this.ctx.moveTo(centerX, y);
      this.ctx.lineTo(x + width * 0.85, centerY);
      this.ctx.lineTo(centerX, y + height);
      this.ctx.lineTo(x + width * 0.15, centerY);
    } else {
      // 六邊形礦石
      const sides = 6;
      const radius = width * 0.5;
      for (let i = 0; i < sides; i++) {
        const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
        const px = centerX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius * 0.9;
        if (i === 0) {
          this.ctx.moveTo(px, py);
        } else {
          this.ctx.lineTo(px, py);
        }
      }
    }
    
    this.ctx.closePath();
    this.ctx.fill();
    
    // 取消陰影以繪製細節
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
    
    // 將十六進制顏色轉換為 RGB
    const rgb = this.hexToRgb(color);
    
    // 礦石紋理（深色裂紋）
    this.ctx.strokeStyle = `rgba(${Math.max(0, rgb.r - 50)}, ${Math.max(0, rgb.g - 50)}, ${Math.max(0, rgb.b - 50)}, 0.8)`;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x + width * 0.3, y + height * 0.2);
    this.ctx.lineTo(x + width * 0.6, y + height * 0.5);
    this.ctx.lineTo(x + width * 0.4, y + height * 0.8);
    this.ctx.stroke();
    
    // 礦石高光（淺色）
    this.ctx.fillStyle = `rgba(${Math.min(255, rgb.r + 50)}, ${Math.min(255, rgb.g + 50)}, ${Math.min(255, rgb.b + 50)}, 0.4)`;
    this.ctx.beginPath();
    this.ctx.ellipse(centerX - width * 0.15, centerY - height * 0.15, width * 0.15, height * 0.1, 0, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
  }
  
  // 繪製水晶（多面體，閃爍發光）
  private drawCrystal(enemy: Enemy) {
    const { x, y, width, height, color, shape, glowPhase } = enemy;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    // 計算閃爍強度（0.6 - 1.0 之間變化）
    const glowIntensity = 0.6 + Math.sin(glowPhase || 0) * 0.4;
    
    this.ctx.save();
    
    // 將十六進制顏色轉換為 RGB
    const rgb = this.hexToRgb(color);
    
    // 水晶外發光效果（閃爍）
    const glowSize = width * 1.5 * glowIntensity;
    const glowGradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, glowSize
    );
    glowGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.6 * glowIntensity})`);
    glowGradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.3 * glowIntensity})`);
    glowGradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
    
    this.ctx.fillStyle = glowGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
    this.ctx.fill();
    
    // 根據形狀選擇不同的水晶樣式
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    
    if (shape === 0) {
      // 尖銳的菱形水晶
      this.ctx.moveTo(centerX, y);
      this.ctx.lineTo(x + width * 0.8, centerY - height * 0.1);
      this.ctx.lineTo(x + width * 0.9, centerY + height * 0.2);
      this.ctx.lineTo(centerX, y + height);
      this.ctx.lineTo(x + width * 0.1, centerY + height * 0.2);
      this.ctx.lineTo(x + width * 0.2, centerY - height * 0.1);
    } else if (shape === 1) {
      // 六角形水晶
      const sides = 6;
      const radius = width * 0.5;
      for (let i = 0; i < sides; i++) {
        const angle = (Math.PI * 2 * i) / sides;
        const px = centerX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius * 0.85;
        if (i === 0) {
          this.ctx.moveTo(px, py);
        } else {
          this.ctx.lineTo(px, py);
        }
      }
    } else {
      // 多面體水晶（八邊形）
      const sides = 8;
      const radius = width * 0.5;
      for (let i = 0; i < sides; i++) {
        const angle = (Math.PI * 2 * i) / sides;
        const px = centerX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius * 0.8;
        if (i === 0) {
          this.ctx.moveTo(px, py);
        } else {
          this.ctx.lineTo(px, py);
        }
      }
    }
    
    this.ctx.closePath();
    this.ctx.fill();
    
    // 水晶內部反光面（明亮的三角形）
    this.ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * glowIntensity})`;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - width * 0.1, y + height * 0.3);
    this.ctx.lineTo(centerX + width * 0.1, y + height * 0.25);
    this.ctx.lineTo(centerX, y + height * 0.5);
    this.ctx.closePath();
    this.ctx.fill();
    
    // 水晶高光點（閃爍）
    this.ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * glowIntensity})`;
    this.ctx.beginPath();
    this.ctx.arc(centerX - width * 0.15, centerY - height * 0.15, 3 * glowIntensity, 0, Math.PI * 2);
    this.ctx.fill();
    
    // 額外的閃光點（小）
    this.ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * glowIntensity})`;
    this.ctx.beginPath();
    this.ctx.arc(centerX + width * 0.1, centerY + height * 0.1, 2 * glowIntensity, 0, Math.PI * 2);
    this.ctx.fill();
    
    // 水晶邊緣發光線條（閃爍）
    this.ctx.strokeStyle = `rgba(${Math.min(255, rgb.r + 100)}, ${Math.min(255, rgb.g + 100)}, ${Math.min(255, rgb.b + 100)}, ${0.6 * glowIntensity})`;
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    
    this.ctx.restore();
  }

  // ==================== 增強視覺特效方法 ====================

  // 創建震動波
  private createShockwave() {
    const centerX = this.player.x + this.player.width / 2;
    const centerY = this.player.y + this.player.height / 2;
    
    this.shockwaves.push({
      radius: 20, // 從更大的半徑開始，避免負數問題
      alpha: 0.8,
      maxRadius: 100
    });
  }

  // 更新震動波
  private updateShockwaves() {
    this.shockwaves = this.shockwaves.filter(wave => {
      wave.radius += 4; // 擴散速度
      wave.alpha -= 0.02; // 淡出速度
      return wave.alpha > 0 && wave.radius < wave.maxRadius;
    });
  }

  // 繪製震動波
  private drawShockwaves() {
    const centerX = this.player.x + this.player.width / 2;
    const centerY = this.player.y + this.player.height / 2;
    
    this.shockwaves.forEach(wave => {
      // 外圈震動波
      this.ctx.strokeStyle = `rgba(255, 215, 0, ${wave.alpha * 0.6})`;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, wave.radius, 0, Math.PI * 2);
      this.ctx.stroke();
      
      // 內圈震動波（確保半徑不會是負數）
      const innerCircleRadius = Math.max(0, wave.radius - 5);
      if (innerCircleRadius > 0) {
        this.ctx.strokeStyle = `rgba(255, 235, 59, ${wave.alpha * 0.8})`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, innerCircleRadius, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      
      // 光暈效果（確保半徑不會是負數）
      const glowInnerRadius = Math.max(0, wave.radius - 10);
      const glowOuterRadius = wave.radius + 10;
      
      const gradient = this.ctx.createRadialGradient(
        centerX, centerY, glowInnerRadius,
        centerX, centerY, glowOuterRadius
      );
      gradient.addColorStop(0, 'rgba(255, 215, 0, 0)');
      gradient.addColorStop(0.5, `rgba(255, 215, 0, ${wave.alpha * 0.3})`);
      gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, wave.radius, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  // 創建光圈漣漪
  private createRipple() {
    const centerX = this.player.x + this.player.width / 2;
    const centerY = this.player.y + this.player.height / 2;
    
    this.ripples.push({
      x: centerX,
      y: centerY,
      radius: 15, // 從更大的半徑開始，避免負數問題
      alpha: 0.9
    });
  }

  // 更新光圈漣漪
  private updateRipples() {
    this.ripples = this.ripples.filter(ripple => {
      ripple.radius += 3; // 擴散速度
      ripple.alpha -= 0.015; // 淡出速度
      return ripple.alpha > 0 && ripple.radius < 120;
    });
  }

  // 繪製光圈漣漪
  private drawRipples() {
    this.ripples.forEach(ripple => {
      // 繪製多層漣漪
      for (let i = 0; i < 3; i++) {
        const layerRadius = ripple.radius - i * 8;
        if (layerRadius > 0) {
          const layerAlpha = ripple.alpha * (1 - i * 0.3);
          
          // 漣漪圓環
          this.ctx.strokeStyle = `rgba(255, 215, 0, ${layerAlpha * 0.7})`;
          this.ctx.lineWidth = 2.5;
          this.ctx.beginPath();
          this.ctx.arc(ripple.x, ripple.y, layerRadius, 0, Math.PI * 2);
          this.ctx.stroke();
          
          // 漣漪光暈（確保半徑不會是負數）
          const innerRadius = Math.max(0, layerRadius - 5);
          const outerRadius = layerRadius + 5;
          
          const rippleGradient = this.ctx.createRadialGradient(
            ripple.x, ripple.y, innerRadius,
            ripple.x, ripple.y, outerRadius
          );
          rippleGradient.addColorStop(0, 'rgba(255, 235, 59, 0)');
          rippleGradient.addColorStop(0.5, `rgba(255, 235, 59, ${layerAlpha * 0.25})`);
          rippleGradient.addColorStop(1, 'rgba(255, 235, 59, 0)');
          
          this.ctx.fillStyle = rippleGradient;
          this.ctx.beginPath();
          this.ctx.arc(ripple.x, ripple.y, layerRadius, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    });
  }

  // 添加拖尾粒子（根據性能模式調整）
  private addTrailParticles() {
    // 低性能模式不添加拖尾粒子
    if (this.performanceMode === 'low') return;
    
    const centerX = this.player.x + this.player.width / 2;
    const centerY = this.player.y + this.player.height;
    
    // 根據性能模式調整粒子數量
    const particleCount = this.performanceMode === 'medium' ? 1 : 2;
    
    for (let i = 0; i < particleCount; i++) {
      this.trailParticles.push({
        x: centerX + (Math.random() - 0.5) * this.player.width * 0.6,
        y: centerY,
        alpha: 0.8,
        size: 2 + Math.random() * 3
      });
    }
  }

  // 更新拖尾粒子
  private updateTrailParticles() {
    this.trailParticles = this.trailParticles.filter(particle => {
      particle.y += 2; // 粒子向下飄散
      particle.alpha -= 0.02; // 淡出
      particle.size *= 0.97; // 縮小
      return particle.alpha > 0 && particle.y < this.CANVAS_HEIGHT;
    });
  }

  // 繪製拖尾粒子
  private drawTrailParticles() {
    this.trailParticles.forEach(particle => {
      // 粒子核心
      this.ctx.fillStyle = `rgba(255, 255, 255, ${particle.alpha * 0.9})`;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.size * 0.5, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 金色粒子
      this.ctx.fillStyle = `rgba(76, 175, 80, ${particle.alpha * 0.8})`;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 粒子光暈
      const gradient = this.ctx.createRadialGradient(
        particle.x, particle.y, 0,
        particle.x, particle.y, particle.size * 2
      );
      gradient.addColorStop(0, `rgba(102, 187, 106, ${particle.alpha * 0.5})`);
      gradient.addColorStop(1, 'rgba(102, 187, 106, 0)');
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.size * 2, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  // ==================== 觸控控制方法 ====================

  // 設置觸控控制
  private setupTouchControls() {
    const joystickBase = document.querySelector('.joystick-base') as HTMLElement;
    
    if (joystickBase) {
      console.log('✅ 虛擬搖桿元素找到，正在綁定觸控事件...');
      
      // 移除可能存在的舊事件監聽器（防止重複綁定）
      const clonedJoystick = joystickBase.cloneNode(true) as HTMLElement;
      joystickBase.parentNode?.replaceChild(clonedJoystick, joystickBase);
      
      // 重新獲取元素並綁定事件
      const newJoystickBase = document.querySelector('.joystick-base') as HTMLElement;
      
      // 觸摸開始
      newJoystickBase.addEventListener('touchstart', (e) => this.onJoystickStart(e as TouchEvent), { passive: false });
      
      // 觸摸移動
      newJoystickBase.addEventListener('touchmove', (e) => this.onJoystickMove(e as TouchEvent), { passive: false });
      
      // 觸摸結束
      newJoystickBase.addEventListener('touchend', () => this.onJoystickEnd(), { passive: false });
      newJoystickBase.addEventListener('touchcancel', () => this.onJoystickEnd(), { passive: false });
      
      console.log('✅ 觸控事件綁定成功！');
    } else {
      console.error('❌ 找不到虛擬搖桿元素 (.joystick-base)');
    }
  }

  // 虛擬搖桿觸摸開始
  private onJoystickStart(event: TouchEvent) {
    console.log('🎮 搖桿觸摸開始');
    if (!this.gameStarted || this.gameOver) return;
    
    event.preventDefault();
    this.joystickActive = true;
    
    const touch = event.touches[0];
    const joystickBase = event.target as HTMLElement;
    const rect = joystickBase.getBoundingClientRect();
    
    this.joystickBaseX = rect.left + rect.width / 2;
    this.joystickBaseY = rect.top + rect.height / 2;
    
    this.updateJoystickPosition(touch.clientX, touch.clientY);
  }

  // 虛擬搖桿觸摸移動
  private onJoystickMove(event: TouchEvent) {
    if (!this.joystickActive || !this.gameStarted || this.gameOver) return;
    
    event.preventDefault();
    const touch = event.touches[0];
    this.updateJoystickPosition(touch.clientX, touch.clientY);
  }

  // 虛擬搖桿觸摸結束
  private onJoystickEnd() {
    this.joystickActive = false;
    this.joystickX = 0;
    this.joystickY = 0;
    this.touchMoveDirection = { x: 0, y: 0 };
  }

  // 更新搖桿位置和方向
  private updateJoystickPosition(touchX: number, touchY: number) {
    // 計算相對於搖桿中心的偏移
    let deltaX = touchX - this.joystickBaseX;
    let deltaY = touchY - this.joystickBaseY;
    
    // 計算距離和角度
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // 限制搖桿移動範圍
    if (distance > this.JOYSTICK_MAX_DISTANCE) {
      const angle = Math.atan2(deltaY, deltaX);
      deltaX = Math.cos(angle) * this.JOYSTICK_MAX_DISTANCE;
      deltaY = Math.sin(angle) * this.JOYSTICK_MAX_DISTANCE;
    }
    
    // 更新搖桿視覺位置
    this.joystickX = deltaX;
    this.joystickY = deltaY;
    
    // 更新移動方向（標準化）
    if (distance > 0) {
      this.touchMoveDirection.x = deltaX / this.JOYSTICK_MAX_DISTANCE;
      this.touchMoveDirection.y = deltaY / this.JOYSTICK_MAX_DISTANCE;
    } else {
      this.touchMoveDirection = { x: 0, y: 0 };
    }
  }

  // 射擊按鈕按下
  onShootButtonPress(event: TouchEvent) {
    if (!this.gameStarted || this.gameOver) return;
    
    event.preventDefault();
    this.shootButtonPressed = true;
    
    // 立即發射一次
    if (this.shootCooldown === 0) {
      this.shootBullet();
      this.shootCooldown = this.SHOOT_COOLDOWN;
    }
  }

  // 射擊按鈕放開
  onShootButtonRelease(event: TouchEvent) {
    event.preventDefault();
    this.shootButtonPressed = false;
  }

  // 顯示遊戲說明（彈出窗口）
  async showGameInstructions() {
    const alert = await this.alertController.create({
      header: '🎮 遊戲說明',
      message: '<div style="line-height: 2;">' +
        '🕹️ 搖桿/方向鍵：移動戰機<br>' +
        '🔥 射擊鈕/空白鍵：發射子彈<br>' +
        '💥 左鍵+空白鍵：左偏射擊<br>' +
        '💥 右鍵+空白鍵：右偏射擊<br><br>' +
        '🎵 每3發變愛心，子彈隨機變色<br>' +
        '✨ 上下移動3步：金色特效<br>' +
        '💎 打中3次水晶：銀色特效<br>' +
        '🎪 8色舞台燈光隨節拍律動<br>' +
        '⚡ 兩側激光束與頻閃效果<br><br>' +
        '🎯 消滅敵機得分，避免碰撞！' +
        '</div>',
      buttons: [
        {
          text: '開始遊戲',
          role: 'cancel',
          cssClass: 'alert-button-confirm'
        }
      ],
      cssClass: 'game-instructions-alert'
    });

    await alert.present();
  }
  
  // 將十六進制顏色轉換為 RGB
  private hexToRgb(hex: string): { r: number, g: number, b: number } {
    // 移除 # 號
    hex = hex.replace('#', '');
    
    // 解析 RGB 值
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return { r, g, b };
  }
  
  // ==================== 音效系統方法 ====================
  
  // 初始化音頻上下文
  private initAudio() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.3; // 主音量設為 30%
        this.masterGain.connect(this.audioContext.destination);
        this.audioContextState = this.audioContext.state; // 更新狀態顯示
        console.log('🔊 音效系統初始化成功，狀態:', this.audioContext.state);
        
        // iOS Safari 需要在用戶交互中顯式啟動
        if (this.audioContext.state === 'suspended') {
          console.log('⚠️ AudioContext 處於暫停狀態，將在 enterGame() 中啟動');
        }
      } catch (error) {
        console.error('❌ 音效系統初始化失敗:', error);
        this.audioContextState = '初始化失敗';
      }
    }
  }
  
  // 確保音頻上下文已啟動（iOS Safari 關鍵修復）
  private async ensureAudioContextRunning(): Promise<boolean> {
    if (!this.audioContext) {
      console.warn('⚠️ AudioContext 未初始化');
      return false;
    }
    
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('✅ AudioContext 已啟動 (狀態:', this.audioContext.state, ')');
        return true;
      } catch (error) {
        console.error('❌ 無法啟動 AudioContext:', error);
        return false;
      }
    }
    
    return this.audioContext.state === 'running';
  }
  
  // 播放遊戲開始音效（上升的合成器音階）
  private async playGameStartSound() {
    if (!this.audioContext || !this.masterGain) return;
    
    // iOS Safari 關鍵：確保音頻上下文正在運行
    const isRunning = await this.ensureAudioContextRunning();
    if (!isRunning) {
      console.warn('⚠️ AudioContext 未運行，無法播放開始音效');
      return;
    }
    
    try {
      const now = this.audioContext.currentTime;
      const duration = 0.8;
      
      // 創建合成器音階（C-E-G-C 大三和弦）
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      
      notes.forEach((freq, index) => {
        const osc = this.audioContext!.createOscillator();
        const gain = this.audioContext!.createGain();
        
        osc.type = 'sine'; // 柔和的正弦波
        osc.frequency.setValueAtTime(freq, now);
        
        // 包絡線（ADSR）
        const startTime = now + index * 0.15;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05); // Attack
        gain.gain.exponentialRampToValueAtTime(0.08, startTime + 0.2); // Decay
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration); // Release
        
        osc.connect(gain);
        gain.connect(this.masterGain!);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      });
      
      console.log('🎵 播放遊戲開始音效');
    } catch (error) {
      console.error('❌ 播放開始音效失敗:', error);
    }
  }
  
  // 播放射擊音效（合成吉他拨弦聲）
  private playShootSound() {
    if (!this.audioContext || !this.masterGain) return;
    
    // iOS Safari：確保音頻上下文正在運行（不阻塞，異步處理）
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => console.error('Resume 失敗:', err));
      return; // 第一次調用時跳過，下次再播放
    }
    
    try {
      const now = this.audioContext.currentTime;
      
      // 吉他音階（E小調五聲音階 - 常見的搖滾/金屬音階）
      const guitarNotes = [
        329.63,  // E4
        392.00,  // G4
        440.00,  // A4
        493.88,  // B4
        587.33,  // D5
        659.25,  // E5
        783.99,  // G5
        880.00,  // A5
        987.77,  // B5
        1174.66, // D6
      ];
      
      // 隨機選擇一個音調
      const baseFreq = guitarNotes[Math.floor(Math.random() * guitarNotes.length)];
      
      const duration = 0.4; // 吉他音持續時間
      const attackTime = 0.005; // 快速起音（拨弦瞬間）
      const decayTime = 0.08; // 衰減時間
      const releaseTime = 0.3; // 釋放時間
      
      // === 基音振盪器（主要音調）===
      const fundamental = this.audioContext.createOscillator();
      const fundamentalGain = this.audioContext.createGain();
      
      fundamental.type = 'triangle'; // 三角波作為基礎
      fundamental.frequency.setValueAtTime(baseFreq, now);
      
      // 吉他特有的包絡線（快速 attack，長時間 decay）
      fundamentalGain.gain.setValueAtTime(0, now);
      fundamentalGain.gain.linearRampToValueAtTime(0.25, now + attackTime); // 快速起音
      fundamentalGain.gain.exponentialRampToValueAtTime(0.12, now + attackTime + decayTime); // 衰減
      fundamentalGain.gain.exponentialRampToValueAtTime(0.01, now + duration); // 釋放
      
      fundamental.connect(fundamentalGain);
      fundamentalGain.connect(this.masterGain);
      
      // === 第二泛音（增加豐富度）===
      const harmonic2 = this.audioContext.createOscillator();
      const harmonic2Gain = this.audioContext.createGain();
      
      harmonic2.type = 'sine';
      harmonic2.frequency.setValueAtTime(baseFreq * 2, now); // 二倍頻
      
      harmonic2Gain.gain.setValueAtTime(0, now);
      harmonic2Gain.gain.linearRampToValueAtTime(0.12, now + attackTime);
      harmonic2Gain.gain.exponentialRampToValueAtTime(0.06, now + attackTime + decayTime);
      harmonic2Gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      harmonic2.connect(harmonic2Gain);
      harmonic2Gain.connect(this.masterGain);
      
      // === 第三泛音 ===
      const harmonic3 = this.audioContext.createOscillator();
      const harmonic3Gain = this.audioContext.createGain();
      
      harmonic3.type = 'sine';
      harmonic3.frequency.setValueAtTime(baseFreq * 3, now); // 三倍頻
      
      harmonic3Gain.gain.setValueAtTime(0, now);
      harmonic3Gain.gain.linearRampToValueAtTime(0.08, now + attackTime);
      harmonic3Gain.gain.exponentialRampToValueAtTime(0.04, now + attackTime + decayTime);
      harmonic3Gain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.8);
      
      harmonic3.connect(harmonic3Gain);
      harmonic3Gain.connect(this.masterGain);
      
      // === 第四泛音 ===
      const harmonic4 = this.audioContext.createOscillator();
      const harmonic4Gain = this.audioContext.createGain();
      
      harmonic4.type = 'sine';
      harmonic4.frequency.setValueAtTime(baseFreq * 4, now); // 四倍頻
      
      harmonic4Gain.gain.setValueAtTime(0, now);
      harmonic4Gain.gain.linearRampToValueAtTime(0.05, now + attackTime);
      harmonic4Gain.gain.exponentialRampToValueAtTime(0.025, now + attackTime + decayTime);
      harmonic4Gain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.7);
      
      harmonic4.connect(harmonic4Gain);
      harmonic4Gain.connect(this.masterGain);
      
      // === 拨片擊弦噪音（模擬真實拨弦瞬間的噪音）===
      const noiseBuffer = this.createNoiseBuffer(0.02);
      const noiseSource = this.audioContext.createBufferSource();
      const noiseGain = this.audioContext.createGain();
      const noiseFilter = this.audioContext.createBiquadFilter();
      
      noiseSource.buffer = noiseBuffer;
      noiseFilter.type = 'bandpass'; // 帶通濾波器
      noiseFilter.frequency.setValueAtTime(baseFreq * 2, now); // 濾波器頻率跟隨音調
      noiseFilter.Q.setValueAtTime(5, now); // 較高的 Q 值，使噪音更集中
      
      noiseGain.gain.setValueAtTime(0.08, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.02); // 極短的噪音
      
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      
      // === 低頻襯底（增加厚度和力量感）===
      const lowEnd = this.audioContext.createOscillator();
      const lowEndGain = this.audioContext.createGain();
      const lowEndFilter = this.audioContext.createBiquadFilter();
      
      lowEnd.type = 'sawtooth';
      lowEnd.frequency.setValueAtTime(baseFreq * 0.5, now); // 低八度
      
      lowEndFilter.type = 'lowpass';
      lowEndFilter.frequency.setValueAtTime(300, now);
      
      lowEndGain.gain.setValueAtTime(0, now);
      lowEndGain.gain.linearRampToValueAtTime(0.06, now + attackTime);
      lowEndGain.gain.exponentialRampToValueAtTime(0.03, now + attackTime + decayTime);
      lowEndGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.6);
      
      lowEnd.connect(lowEndFilter);
      lowEndFilter.connect(lowEndGain);
      lowEndGain.connect(this.masterGain);
      
      // 播放所有音源
      fundamental.start(now);
      fundamental.stop(now + duration);
      
      harmonic2.start(now);
      harmonic2.stop(now + duration);
      
      harmonic3.start(now);
      harmonic3.stop(now + duration * 0.8);
      
      harmonic4.start(now);
      harmonic4.stop(now + duration * 0.7);
      
      noiseSource.start(now);
      noiseSource.stop(now + 0.02);
      
      lowEnd.start(now);
      lowEnd.stop(now + duration * 0.6);
      
      // 輸出當前音調
      const noteNames = ['E4', 'G4', 'A4', 'B4', 'D5', 'E5', 'G5', 'A5', 'B5', 'D6'];
      const noteIndex = guitarNotes.indexOf(baseFreq);
      console.log(`🎸 吉他射擊音效！音調: ${noteNames[noteIndex]} (${baseFreq.toFixed(2)} Hz)`);
      
    } catch (error) {
      console.error('❌ 播放射擊音效失敗:', error);
    }
  }
  
  // 播放齒輪聲（左右移動）
  private playGearSound() {
    if (!this.audioContext || !this.masterGain) return;
    if (this.gearSoundNodes) return; // 如果已經在播放，不重複播放
    
    // iOS Safari：確保音頻上下文正在運行
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => console.error('Resume 失敗:', err));
      return;
    }
    
    try {
      const now = this.audioContext.currentTime;
      
      // 齒輪聲（快速重複的咔噠聲）
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      const lfo = this.audioContext.createOscillator(); // 低頻振盪器製造咔噠效果
      const lfoGain = this.audioContext.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now); // 較低的基頻
      
      lfo.type = 'square';
      lfo.frequency.setValueAtTime(15, now); // 15Hz 的咔噠頻率
      
      lfoGain.gain.setValueAtTime(80, now); // LFO 調制深度
      
      // 連接 LFO 到主振盪器頻率
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05); // 淡入
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      
      osc.start(now);
      lfo.start(now);
      
      // 保存節點以便後續停止
      this.gearSoundNodes = { osc, lfo, gain };
      
    } catch (error) {
      console.error('❌ 播放齒輪聲失敗:', error);
    }
  }
  
  // 播放引擎聲（前後移動 - 5種不同的引擎聲）
  private playEngineSound() {
    if (!this.audioContext || !this.masterGain) return;
    if (this.engineSoundNodes) return; // 如果已經在播放，不重複播放
    
    // iOS Safari：確保音頻上下文正在運行
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => console.error('Resume 失敗:', err));
      return;
    }
    
    try {
      // 隨機選擇引擎類型（0-4）
      this.currentEngineType = Math.floor(Math.random() * 5);
      
      const engineTypes = [
        '🛩️ 飛機引擎',
        '🏎️ 跑車引擎', 
        '🚜 農機引擎',
        '🚂 火車引擎',
        '🏍️ 摩托車引擎'
      ];
      
      console.log(`${engineTypes[this.currentEngineType]} 啟動！`);
      
      // 根據類型調用不同的引擎聲生成器
      switch(this.currentEngineType) {
        case 0:
          this.playAircraftEngine();
          break;
        case 1:
          this.playCarEngine();
          break;
        case 2:
          this.playTractorEngine();
          break;
        case 3:
          this.playTrainEngine();
          break;
        case 4:
          this.playMotorcycleEngine();
          break;
      }
      
    } catch (error) {
      console.error('❌ 播放引擎聲失敗:', error);
    }
  }
  
  // 🛩️ 飛機引擎（噴射渦輪聲 - 高頻空間感）
  private playAircraftEngine() {
    if (!this.audioContext || !this.masterGain) return;
    
    const now = this.audioContext.currentTime;
    
    // 主引擎（渦輪高頻）
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now); // 較高頻率
    
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(8, now); // 8Hz 渦輪抖動
    lfoGain.gain.setValueAtTime(25, now);
    
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    
    // 帶通濾波器製造空氣感
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.setValueAtTime(2, now);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.15);
    
    osc.connect(filter);
    filter.connect(gain);
    
    // === 空間效果：延遲製造演唱會空間感 ===
    const delay = this.audioContext.createDelay();
    const delayGain = this.audioContext.createGain();
    const feedbackGain = this.audioContext.createGain();
    
    delay.delayTime.setValueAtTime(0.15, now); // 150ms 延遲
    delayGain.gain.setValueAtTime(0.4, now); // 延遲音量
    feedbackGain.gain.setValueAtTime(0.3, now); // 回饋量
    
    gain.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(this.masterGain);
    
    // 回饋迴路
    delay.connect(feedbackGain);
    feedbackGain.connect(delay);
    
    // 直接輸出（乾音）
    gain.connect(this.masterGain);
    
    osc.start(now);
    lfo.start(now);
    
    this.engineSoundNodes = { osc, lfo, gain };
  }
  
  // 🏎️ 跑車引擎（V8 引擎聲 - 中頻飽滿）
  private playCarEngine() {
    if (!this.audioContext || !this.masterGain) return;
    
    const now = this.audioContext.currentTime;
    
    // V8 引擎主音
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    
    osc.type = 'square'; // 方波模擬爆裂聲
    osc.frequency.setValueAtTime(100, now);
    
    lfo.type = 'triangle';
    lfo.frequency.setValueAtTime(12, now); // 12Hz 活塞運動
    lfoGain.gain.setValueAtTime(30, now);
    
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    
    // 低通濾波器
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.Q.setValueAtTime(5, now); // 高Q值製造共鳴
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.12);
    
    osc.connect(filter);
    filter.connect(gain);
    
    // === 空間效果：混響製造車庫/演唱會空間感 ===
    const convolver = this.audioContext.createConvolver();
    const convolverGain = this.audioContext.createGain();
    
    // 創建簡單的混響脈衝響應
    const reverbBuffer = this.createReverbBuffer(1.5, 0.6); // 1.5秒混響
    convolver.buffer = reverbBuffer;
    convolverGain.gain.setValueAtTime(0.5, now);
    
    gain.connect(convolver);
    convolver.connect(convolverGain);
    convolverGain.connect(this.masterGain);
    
    // 直接輸出
    gain.connect(this.masterGain);
    
    osc.start(now);
    lfo.start(now);
    
    this.engineSoundNodes = { osc, lfo, gain };
  }
  
  // 🚜 農機引擎（柴油引擎 - 低頻重擊）
  private playTractorEngine() {
    if (!this.audioContext || !this.masterGain) return;
    
    const now = this.audioContext.currentTime;
    
    // 柴油引擎
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, now); // 超低頻
    
    lfo.type = 'square'; // 方波製造突突突的柴油感
    lfo.frequency.setValueAtTime(4, now); // 4Hz 慢速
    lfoGain.gain.setValueAtTime(20, now);
    
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    
    // 低通濾波器
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, now);
    filter.Q.setValueAtTime(8, now); // 超高Q值製造沉重感
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.2); // 慢啟動
    
    osc.connect(filter);
    filter.connect(gain);
    
    // === Bass電吉他效果層 ===
    const bassOsc = this.audioContext.createOscillator();
    const bassGain = this.audioContext.createGain();
    const bassFilter = this.audioContext.createBiquadFilter();
    
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(40, now); // 超低音
    
    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(120, now);
    
    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.12, now + 0.2);
    
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(this.masterGain);
    
    bassOsc.start(now);
    
    // === 空間效果：延遲 ===
    const delay = this.audioContext.createDelay();
    const delayGain = this.audioContext.createGain();
    
    delay.delayTime.setValueAtTime(0.25, now); // 250ms 延遲
    delayGain.gain.setValueAtTime(0.3, now);
    
    gain.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(this.masterGain);
    
    gain.connect(this.masterGain);
    
    osc.start(now);
    lfo.start(now);
    
    this.engineSoundNodes = { osc, lfo, gain };
  }
  
  // 🚂 火車引擎（蒸汽引擎 - 超低頻震動）
  private playTrainEngine() {
    if (!this.audioContext || !this.masterGain) return;
    
    const now = this.audioContext.currentTime;
    
    // 蒸汽引擎主音
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(45, now); // 極低頻
    
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(2.5, now); // 2.5Hz 慢速震動
    lfoGain.gain.setValueAtTime(12, now);
    
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(150, now);
    filter.Q.setValueAtTime(10, now); // 極高Q值
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.25); // 慢啟動
    
    osc.connect(filter);
    filter.connect(gain);
    
    // === Sub Bass層（電bass模擬）===
    const subBass = this.audioContext.createOscillator();
    const subGain = this.audioContext.createGain();
    
    subBass.type = 'sine';
    subBass.frequency.setValueAtTime(30, now); // 30Hz 超低音
    
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.15, now + 0.25);
    
    subBass.connect(subGain);
    subGain.connect(this.masterGain);
    
    subBass.start(now);
    
    // === 空間效果：大型空間混響 ===
    const convolver = this.audioContext.createConvolver();
    const convolverGain = this.audioContext.createGain();
    
    const reverbBuffer = this.createReverbBuffer(3.0, 0.7); // 3秒長混響
    convolver.buffer = reverbBuffer;
    convolverGain.gain.setValueAtTime(0.6, now); // 較多混響
    
    gain.connect(convolver);
    convolver.connect(convolverGain);
    convolverGain.connect(this.masterGain);
    
    gain.connect(this.masterGain);
    
    osc.start(now);
    lfo.start(now);
    
    this.engineSoundNodes = { osc, lfo, gain };
  }
  
  // 🏍️ 摩托車引擎（高能量引擎 - 明亮有力）
  private playMotorcycleEngine() {
    if (!this.audioContext || !this.masterGain) return;
    
    const now = this.audioContext.currentTime;
    
    // 摩托車引擎
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now); // 中高頻
    
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(15, now); // 15Hz 高速震動
    lfoGain.gain.setValueAtTime(40, now);
    
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    
    // 帶通濾波器製造明亮感
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.Q.setValueAtTime(4, now);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.08); // 快速啟動
    
    osc.connect(filter);
    filter.connect(gain);
    
    // === 高頻泛音層（增加金屬感）===
    const harmonicOsc = this.audioContext.createOscillator();
    const harmonicGain = this.audioContext.createGain();
    const harmonicFilter = this.audioContext.createBiquadFilter();
    
    harmonicOsc.type = 'square';
    harmonicOsc.frequency.setValueAtTime(240, now); // 二倍頻
    
    harmonicFilter.type = 'highpass';
    harmonicFilter.frequency.setValueAtTime(1000, now);
    
    harmonicGain.gain.setValueAtTime(0, now);
    harmonicGain.gain.linearRampToValueAtTime(0.08, now + 0.08);
    
    harmonicOsc.connect(harmonicFilter);
    harmonicFilter.connect(harmonicGain);
    harmonicGain.connect(this.masterGain);
    
    harmonicOsc.start(now);
    
    // === 空間效果：立體聲延遲 ===
    const delay1 = this.audioContext.createDelay();
    const delay2 = this.audioContext.createDelay();
    const delayGain1 = this.audioContext.createGain();
    const delayGain2 = this.audioContext.createGain();
    
    delay1.delayTime.setValueAtTime(0.1, now); // 100ms
    delay2.delayTime.setValueAtTime(0.18, now); // 180ms
    delayGain1.gain.setValueAtTime(0.35, now);
    delayGain2.gain.setValueAtTime(0.25, now);
    
    gain.connect(delay1);
    gain.connect(delay2);
    delay1.connect(delayGain1);
    delay2.connect(delayGain2);
    delayGain1.connect(this.masterGain);
    delayGain2.connect(this.masterGain);
    
    gain.connect(this.masterGain);
    
    osc.start(now);
    lfo.start(now);
    
    this.engineSoundNodes = { osc, lfo, gain };
  }
  
  // 創建混響緩衝（用於演唱會空間感）
  private createReverbBuffer(duration: number, decay: number): AudioBuffer {
    const sampleRate = this.audioContext!.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.audioContext!.createBuffer(2, length, sampleRate);
    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
      // 指數衰減
      const envelope = Math.pow(1 - i / length, decay * 3);
      
      // 白噪音 + 衰減
      leftChannel[i] = (Math.random() * 2 - 1) * envelope;
      rightChannel[i] = (Math.random() * 2 - 1) * envelope;
      
      // 添加早期反射（模擬牆壁反射）
      if (i < sampleRate * 0.05) { // 前50ms
        const reflectionEnvelope = 1 - i / (sampleRate * 0.05);
        leftChannel[i] += (Math.random() * 2 - 1) * reflectionEnvelope * 0.5;
        rightChannel[i] += (Math.random() * 2 - 1) * reflectionEnvelope * 0.5;
      }
    }
    
    return buffer;
  }
  
  // 停止移動音效
  private stopMovementSounds() {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    const fadeOutTime = 0.1;
    
    // 停止齒輪聲
    if (this.gearSoundNodes) {
      try {
        // 淡出
        this.gearSoundNodes.gain.gain.setValueAtTime(this.gearSoundNodes.gain.gain.value, now);
        this.gearSoundNodes.gain.gain.linearRampToValueAtTime(0, now + fadeOutTime);
        
        // 停止振盪器
        this.gearSoundNodes.osc.stop(now + fadeOutTime);
        this.gearSoundNodes.lfo.stop(now + fadeOutTime);
      } catch (error) {
        // 忽略錯誤（可能已經停止）
      }
      this.gearSoundNodes = null;
    }
    
    // 停止引擎聲
    if (this.engineSoundNodes) {
      try {
        // 淡出
        this.engineSoundNodes.gain.gain.setValueAtTime(this.engineSoundNodes.gain.gain.value, now);
        this.engineSoundNodes.gain.gain.linearRampToValueAtTime(0, now + fadeOutTime);
        
        // 停止振盪器
        this.engineSoundNodes.osc.stop(now + fadeOutTime);
        this.engineSoundNodes.lfo.stop(now + fadeOutTime);
      } catch (error) {
        // 忽略錯誤（可能已經停止）
      }
      this.engineSoundNodes = null;
    }
  }
  
  // 停止所有音效
  private stopAllSounds() {
    this.stopMovementSounds();
  }
  
  // 創建噪音緩衝（用於雷射效果）
  private createNoiseBuffer(duration: number): AudioBuffer {
    const sampleRate = this.audioContext!.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = this.audioContext!.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1; // 白噪音
    }
    
    return buffer;
  }
  
  // ==================== 演唱會燈光系統 ====================
  
  // 初始化演唱會燈光（根據性能模式調整）
  private initConcertLights() {
    // 低性能模式不啟用演唱會燈光
    if (this.performanceMode === 'low') {
      console.log('🎪 低性能模式：演唱會燈光已禁用');
      return;
    }
    
    // 創建多個聚光燈
    const spotlightColors = ['#FF1493', '#00FFFF', '#FFD700', '#FF4500', '#00FF00', '#9370DB'];
    
    // 根據性能模式調整聚光燈數量
    const spotlightCount = this.performanceMode === 'medium' ? 4 : 8;
    
    for (let i = 0; i < spotlightCount; i++) {
      this.spotlights.push({
        x: (i / (spotlightCount - 1)) * this.CANVAS_WIDTH,
        y: -50,
        radius: 60 + Math.random() * 40,
        color: spotlightColors[Math.floor(Math.random() * spotlightColors.length)],
        alpha: 0.3 + Math.random() * 0.3,
        angle: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.03
      });
    }
    
    // 設置節拍效果定時器（模擬音樂節拍）
    // 中等性能模式降低節拍頻率
    const beatInterval = this.performanceMode === 'medium' ? 800 : 500;
    this.beatInterval = setInterval(() => {
      this.triggerBeatEffect();
    }, beatInterval);
    
    console.log(`🎪 演唱會燈光系統啟動！(${spotlightCount}個聚光燈)`);
  }
  
  // 更新演唱會燈光
  private updateConcertLights() {
    this.colorCycle += 0.02;
    this.beatPhase += 0.1;
    
    // 更新聚光燈位置和顏色
    this.spotlights.forEach(spotlight => {
      spotlight.angle += spotlight.speed;
      spotlight.x = this.CANVAS_WIDTH / 2 + Math.cos(spotlight.angle) * 150;
      
      // 隨機改變顏色（低頻率）
      if (Math.random() < 0.01) {
        const colors = ['#FF1493', '#00FFFF', '#FFD700', '#FF4500', '#00FF00', '#9370DB', '#FF69B4', '#1E90FF'];
        spotlight.color = colors[Math.floor(Math.random() * colors.length)];
      }
      
      // 脈動效果
      spotlight.alpha = 0.3 + Math.sin(this.beatPhase + spotlight.angle) * 0.2;
    });
    
    // 更新激光射線
    this.laserBeams = this.laserBeams.filter(beam => {
      beam.alpha -= 0.03;
      return beam.alpha > 0;
    });
    
    // 隨機生成新的激光射線
    if (Math.random() < 0.05) {
      this.createLaserBeam();
    }
    
    // 更新頻閃效果
    if (this.flashEffect.active) {
      this.flashEffect.alpha -= 0.1;
      if (this.flashEffect.alpha <= 0) {
        this.flashEffect.active = false;
      }
    }
  }
  
  // 繪製聚光燈
  private drawSpotlights() {
    this.spotlights.forEach(spotlight => {
      const gradient = this.ctx.createRadialGradient(
        spotlight.x, spotlight.y, 0,
        spotlight.x, spotlight.y, spotlight.radius
      );
      
      const rgb = this.hexToRgb(spotlight.color);
      gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${spotlight.alpha})`);
      gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${spotlight.alpha * 0.5})`);
      gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(spotlight.x, spotlight.y, spotlight.radius, 0, Math.PI * 2);
      this.ctx.fill();
      
      // 繪製光束從上往下
      const beamGradient = this.ctx.createLinearGradient(
        spotlight.x, spotlight.y,
        spotlight.x, this.CANVAS_HEIGHT
      );
      beamGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${spotlight.alpha * 0.3})`);
      beamGradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${spotlight.alpha * 0.15})`);
      beamGradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
      
      this.ctx.fillStyle = beamGradient;
      this.ctx.beginPath();
      this.ctx.moveTo(spotlight.x - spotlight.radius * 0.3, spotlight.y);
      this.ctx.lineTo(spotlight.x - spotlight.radius * 0.5, this.CANVAS_HEIGHT);
      this.ctx.lineTo(spotlight.x + spotlight.radius * 0.5, this.CANVAS_HEIGHT);
      this.ctx.lineTo(spotlight.x + spotlight.radius * 0.3, spotlight.y);
      this.ctx.closePath();
      this.ctx.fill();
    });
  }
  
  // 創建激光射線
  private createLaserBeam() {
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
    const startSide = Math.random() < 0.5 ? 'left' : 'right';
    
    let x, targetX;
    if (startSide === 'left') {
      x = 0;
      targetX = this.CANVAS_WIDTH * (0.5 + Math.random() * 0.5);
    } else {
      x = this.CANVAS_WIDTH;
      targetX = this.CANVAS_WIDTH * (Math.random() * 0.5);
    }
    
    this.laserBeams.push({
      x: x,
      y: Math.random() * this.CANVAS_HEIGHT * 0.7,
      targetX: targetX,
      targetY: Math.random() * this.CANVAS_HEIGHT,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 0.6,
      width: 2 + Math.random() * 3
    });
  }
  
  // 繪製激光射線
  private drawLaserBeams() {
    this.laserBeams.forEach(beam => {
      const rgb = this.hexToRgb(beam.color);
      
      // 繪製主射線
      this.ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${beam.alpha})`;
      this.ctx.lineWidth = beam.width;
      this.ctx.beginPath();
      this.ctx.moveTo(beam.x, beam.y);
      this.ctx.lineTo(beam.targetX, beam.targetY);
      this.ctx.stroke();
      
      // 繪製光暈
      this.ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${beam.alpha * 0.3})`;
      this.ctx.lineWidth = beam.width * 3;
      this.ctx.stroke();
      
      // 繪製端點光暈
      const endGradient = this.ctx.createRadialGradient(
        beam.targetX, beam.targetY, 0,
        beam.targetX, beam.targetY, 15
      );
      endGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${beam.alpha})`);
      endGradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${beam.alpha * 0.5})`);
      endGradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
      
      this.ctx.fillStyle = endGradient;
      this.ctx.beginPath();
      this.ctx.arc(beam.targetX, beam.targetY, 15, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }
  
  // 觸發節拍效果
  private triggerBeatEffect() {
    if (!this.gameStarted || this.gameOver) return;
    
    // 隨機觸發頻閃
    if (Math.random() < 0.3) {
      const colors = ['#FFFFFF', '#FFD700', '#FF1493', '#00FFFF'];
      this.flashEffect.active = true;
      this.flashEffect.alpha = 0.2;
      this.flashEffect.color = colors[Math.floor(Math.random() * colors.length)];
    }
    
    // 生成新的激光射線
    if (Math.random() < 0.4) {
      this.createLaserBeam();
    }
    
    // 所有聚光燈同時脈動
    this.spotlights.forEach(spotlight => {
      spotlight.alpha = 0.5;
    });
  }
  
  // 繪製頻閃效果
  private drawFlashEffect() {
    if (this.flashEffect.active && this.flashEffect.alpha > 0) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.flashEffect.alpha})`;
      this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
    }
  }
  
  // 啟動背景音樂（電子舞曲風格）
  private startBackgroundMusic() {
    if (!this.audioContext || !this.masterGain) return;
    if (this.bgMusicNodes) return; // 如果已經在播放，不重複
    
    // iOS Safari：確保音頻上下文正在運行
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => console.error('Resume 失敗:', err));
      return;
    }
    
    try {
      const now = this.audioContext.currentTime;
      
      // 低音鼓（Bass Kick）- 模擬 4/4 拍
      const kick = this.audioContext.createOscillator();
      const kickGain = this.audioContext.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(150, now);
      kickGain.gain.setValueAtTime(0.3, now);
      kick.connect(kickGain);
      kickGain.connect(this.masterGain);
      kick.start(now);
      
      // 高頻合成器旋律（Synth Lead）
      const synth = this.audioContext.createOscillator();
      const synthGain = this.audioContext.createGain();
      const lfo = this.audioContext.createOscillator();
      const lfoGain = this.audioContext.createGain();
      
      synth.type = 'sawtooth';
      synth.frequency.setValueAtTime(440, now); // A4
      
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.5, now); // 0.5Hz 調制
      lfoGain.gain.setValueAtTime(100, now);
      
      lfo.connect(lfoGain);
      lfoGain.connect(synth.frequency);
      
      synthGain.gain.setValueAtTime(0.08, now);
      synth.connect(synthGain);
      synthGain.connect(this.masterGain);
      synth.start(now);
      lfo.start(now);
      
      // 填充音（Pad）
      const pad = this.audioContext.createOscillator();
      const padGain = this.audioContext.createGain();
      pad.type = 'triangle';
      pad.frequency.setValueAtTime(220, now); // A3
      padGain.gain.setValueAtTime(0.05, now);
      pad.connect(padGain);
      padGain.connect(this.masterGain);
      pad.start(now);
      
      this.bgMusicNodes = {
        osc1: kick,
        osc2: synth,
        osc3: pad,
        gain: synthGain,
        lfo: lfo
      };
      
      console.log('🎵 背景音樂啟動！');
    } catch (error) {
      console.error('❌ 背景音樂啟動失敗:', error);
    }
  }
  
  // 停止背景音樂
  private stopBackgroundMusic() {
    if (!this.audioContext || !this.bgMusicNodes) return;
    
    try {
      const now = this.audioContext.currentTime;
      const fadeOutTime = 0.5;
      
      // 淡出
      this.bgMusicNodes.gain.gain.setValueAtTime(this.bgMusicNodes.gain.gain.value, now);
      this.bgMusicNodes.gain.gain.linearRampToValueAtTime(0, now + fadeOutTime);
      
      // 停止所有振盪器
      this.bgMusicNodes.osc1.stop(now + fadeOutTime);
      this.bgMusicNodes.osc2.stop(now + fadeOutTime);
      this.bgMusicNodes.osc3.stop(now + fadeOutTime);
      this.bgMusicNodes.lfo.stop(now + fadeOutTime);
      
      this.bgMusicNodes = null;
      console.log('🎵 背景音樂停止');
    } catch (error) {
      console.error('❌ 停止背景音樂失敗:', error);
    }
  }
  
  // 簡化版玩家繪製（低性能模式）
  private drawPlayerSimple(x: number, y: number, width: number, height: number, centerX: number) {
    // 簡單的吉他外形，減少複雜路徑和漸變
    
    // 琴身 - 簡單矩形
    this.ctx.fillStyle = '#C0C0C0'; // 銀色
    this.ctx.fillRect(x, y + height * 0.4, width, height * 0.5);
    
    // 琴頸 - 簡單矩形
    this.ctx.fillStyle = '#8A8A8A';
    this.ctx.fillRect(centerX - width * 0.1, y, width * 0.2, height * 0.4);
    
    // 琴頭 - 簡單三角形
    this.ctx.fillStyle = '#B0B0B0';
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - width * 0.15, y);
    this.ctx.lineTo(centerX + width * 0.15, y);
    this.ctx.lineTo(centerX, y - height * 0.1);
    this.ctx.closePath();
    this.ctx.fill();
    
    // 簡單的拾音器（3條線）
    this.ctx.strokeStyle = '#4A4A4A';
    this.ctx.lineWidth = 2;
    const pickupY = [0.5, 0.6, 0.7];
    pickupY.forEach(ratio => {
      const py = y + height * ratio;
      this.ctx.beginPath();
      this.ctx.moveTo(x + width * 0.3, py);
      this.ctx.lineTo(x + width * 0.7, py);
      this.ctx.stroke();
    });
  }
}
