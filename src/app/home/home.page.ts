import { Component, OnInit, ViewChild, ElementRef, HostListener, OnDestroy } from '@angular/core';

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
export class HomePage implements OnInit, OnDestroy {
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
    if (this.keys['ArrowLeft'] && this.player.x > 0) {
      this.player.x -= this.player.speed!;
    }
    if (this.keys['ArrowRight'] && this.player.x < this.CANVAS_WIDTH - this.player.width) {
      this.player.x += this.player.speed!;
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
}
