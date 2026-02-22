<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  
  export let color = '#4f46e5'; // Color por defecto (indigo)
  export let particleCount = 50;
  export let speed = 0.5;
  export let opacity = 0.3;
  export let size = { min: 1, max: 3 };
  
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let particles: Particle[] = [];
  let animationFrameId: number;
  let width: number;
  let height: number;
  
  class Particle {
    x: number;
    y: number;
    size: number;
    speedX: number;
    speedY: number;
    opacity: number;
    
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.size = Math.random() * (size.max - size.min) + size.min;
      this.speedX = (Math.random() - 0.5) * speed;
      this.speedY = (Math.random() - 0.5) * speed;
      this.opacity = Math.random() * opacity;
    }
    
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      
      // Rebote en los bordes
      if (this.x > width || this.x < 0) {
        this.speedX = -this.speedX;
      }
      
      if (this.y > height || this.y < 0) {
        this.speedY = -this.speedY;
      }
    }
    
    draw() {
      ctx.fillStyle = color;
      ctx.globalAlpha = this.opacity;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  function initParticles() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }
  }
  
  function animate() {
    ctx.clearRect(0, 0, width, height);
    
    particles.forEach(particle => {
      particle.update();
      particle.draw();
    });
    
    // Dibujar líneas entre partículas cercanas
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 100) {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.globalAlpha = (100 - distance) / 500;
          ctx.lineWidth = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    
    animationFrameId = requestAnimationFrame(animate);
  }
  
  function handleResize() {
    if (!canvas) return;
    
    width = canvas.width = canvas.offsetWidth;
    height = canvas.height = canvas.offsetHeight;
    
    initParticles();
  }
  
  onMount(() => {
    // Solo ejecutar código relacionado con el navegador si estamos en el cliente
    if (!browser || !canvas) return;
    
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    width = canvas.width = canvas.offsetWidth;
    height = canvas.height = canvas.offsetHeight;
    
    initParticles();
    animate();
    
    // Solo añadir event listeners en el navegador
    if (browser) {
      window.addEventListener('resize', handleResize);
    }
  });
  
  onDestroy(() => {
    // Solo ejecutar código relacionado con el navegador si estamos en el cliente
    if (!browser) return;
    
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    window.removeEventListener('resize', handleResize);
  });
</script>

<canvas 
  bind:this={canvas} 
  class="absolute inset-0 w-full h-full pointer-events-none z-0"
></canvas>
