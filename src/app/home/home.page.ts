import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, HostListener, OnDestroy } from '@angular/core';

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
}

interface Enemy extends GameObject {
  active: boolean;
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

  // Canvas 尺寸
  private readonly CANVAS_WIDTH = 400;
  private readonly CANVAS_HEIGHT = 600;

  // 玩家戰機
  private player: GameObject = {
    x: 0,
    y: 0,
    width: 40,
    height: 50,
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

  constructor() {}

  ngOnInit() {
    console.log('飛機射擊遊戲初始化');
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.initCanvas();
    }, 100);
  }

  ngOnDestroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  // 監聽鍵盤按下
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (!this.gameStarted || this.gameOver) return;
    
    this.keys[event.key] = true;
    
    // 空白鍵發射子彈
    if (event.key === ' ') {
      event.preventDefault();
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
    const context = this.canvas.getContext('2d');
    
    if (!context) {
      console.error('無法獲取 Canvas 2D 上下文');
      return;
    }
    
    this.ctx = context;
    this.canvas.width = this.CANVAS_WIDTH;
    this.canvas.height = this.CANVAS_HEIGHT;
    
    // 初始化玩家位置
    this.player.x = this.CANVAS_WIDTH / 2 - this.player.width / 2;
    this.player.y = this.CANVAS_HEIGHT - this.player.height - 20;
    
    console.log('Canvas 初始化成功');
  }

  // 開始遊戲
  startGame() {
    this.gameStarted = true;
    this.gameOver = false;
    this.score = 0;
    this.bullets = [];
    this.enemies = [];
    this.enemySpawnTimer = 0;
    
    // 重置玩家位置
    this.player.x = this.CANVAS_WIDTH / 2 - this.player.width / 2;
    this.player.y = this.CANVAS_HEIGHT - this.player.height - 20;
    
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
  }

  // 更新玩家位置
  private updatePlayer() {
    // 鍵盤控制（用於電腦測試）
    if (this.keys['ArrowLeft'] && this.player.x > 0) {
      this.player.x -= this.player.speed!;
    }
    if (this.keys['ArrowRight'] && this.player.x < this.CANVAS_WIDTH - this.player.width) {
      this.player.x += this.player.speed!;
    }
    
    // 觸控搖桿控制（用於手機）
    if (this.joystickActive) {
      const moveSpeed = this.player.speed! * 1.2; // 稍微快一點
      this.player.x += this.touchMoveDirection.x * moveSpeed;
      
      // 限制在畫布範圍內
      this.player.x = Math.max(0, Math.min(this.CANVAS_WIDTH - this.player.width, this.player.x));
    }
    
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
    this.bullets.push({
      x: this.player.x + this.player.width / 2 - 2,
      y: this.player.y,
      width: 4,
      height: 15,
      speed: 7,
      active: true
    });
  }

  // 更新子彈
  private updateBullets() {
    this.bullets = this.bullets.filter(bullet => {
      bullet.y -= bullet.speed!;
      return bullet.y > -bullet.height && bullet.active;
    });
  }

  // 生成敵機
  private spawnEnemies() {
    this.enemySpawnTimer++;
    if (this.enemySpawnTimer >= this.ENEMY_SPAWN_INTERVAL) {
      this.enemySpawnTimer = 0;
      
      const enemy: Enemy = {
        x: Math.random() * (this.CANVAS_WIDTH - 40),
        y: -50,
        width: 40,
        height: 40,
        speed: 2 + Math.random() * 2,
        active: true
      };
      
      this.enemies.push(enemy);
    }
  }

  // 更新敵機
  private updateEnemies() {
    this.enemies = this.enemies.filter(enemy => {
      enemy.y += enemy.speed!;
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
        }
      });
    });

    // 檢測玩家與敵機的碰撞
    this.enemies.forEach(enemy => {
      if (enemy.active && this.isColliding(this.player, enemy)) {
        this.endGame();
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

  // 結束遊戲
  private endGame() {
    this.gameOver = true;
    this.gameStarted = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  // 繪製遊戲畫面
  private draw() {
    // 清空畫布（繪製背景）
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);

    // 繪製星星背景
    this.drawStars();

    // 繪製玩家
    this.drawPlayer();

    // 繪製子彈
    this.drawBullets();

    // 繪製敵機
    this.drawEnemies();
  }

  // 繪製星星背景
  private drawStars() {
    this.ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 50; i++) {
      const x = (i * 37) % this.CANVAS_WIDTH;
      const y = (i * 59 + Date.now() * 0.05) % this.CANVAS_HEIGHT;
      this.ctx.fillRect(x, y, 2, 2);
    }
  }

  // 繪製玩家戰機
  private drawPlayer() {
    const { x, y, width, height } = this.player;
    
    // 機身
    this.ctx.fillStyle = '#4CAF50';
    this.ctx.beginPath();
    this.ctx.moveTo(x + width / 2, y);
    this.ctx.lineTo(x + width, y + height);
    this.ctx.lineTo(x, y + height);
    this.ctx.closePath();
    this.ctx.fill();

    // 機翼
    this.ctx.fillStyle = '#66BB6A';
    this.ctx.fillRect(x - 5, y + height * 0.6, 10, 15);
    this.ctx.fillRect(x + width - 5, y + height * 0.6, 10, 15);

    // 駕駛艙
    this.ctx.fillStyle = '#2196F3';
    this.ctx.beginPath();
    this.ctx.arc(x + width / 2, y + height * 0.4, 8, 0, Math.PI * 2);
    this.ctx.fill();
  }

  // 繪製子彈
  private drawBullets() {
    this.ctx.fillStyle = '#FFEB3B';
    this.bullets.forEach(bullet => {
      if (bullet.active) {
        this.ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        
        // 子彈光暈效果
        this.ctx.fillStyle = 'rgba(255, 235, 59, 0.5)';
        this.ctx.fillRect(bullet.x - 1, bullet.y, bullet.width + 2, bullet.height);
        this.ctx.fillStyle = '#FFEB3B';
      }
    });
  }

  // 繪製敵機
  private drawEnemies() {
    this.enemies.forEach(enemy => {
      if (enemy.active) {
        const { x, y, width, height } = enemy;
        
        // 敵機機身
        this.ctx.fillStyle = '#F44336';
        this.ctx.beginPath();
        this.ctx.moveTo(x + width / 2, y + height);
        this.ctx.lineTo(x + width, y);
        this.ctx.lineTo(x, y);
        this.ctx.closePath();
        this.ctx.fill();

        // 敵機機翼
        this.ctx.fillStyle = '#E57373';
        this.ctx.fillRect(x - 5, y + height * 0.3, 10, 12);
        this.ctx.fillRect(x + width - 5, y + height * 0.3, 10, 12);

        // 敵機標記
        this.ctx.fillStyle = '#FFF';
        this.ctx.beginPath();
        this.ctx.arc(x + width / 2, y + height * 0.5, 5, 0, Math.PI * 2);
        this.ctx.fill();
      }
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
}
