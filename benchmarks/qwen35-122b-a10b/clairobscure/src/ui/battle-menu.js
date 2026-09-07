import { events, Events } from '../core/events.js';

// Battle action selection menu

export class BattleMenu {
  constructor() {
    this.canvas = document.getElementById('overlay');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    
    this.isOpen = false;
    this.selectedCategory = 0;
    this.selectedAction = 0;
    this.categories = ['Attack', 'Skills', 'Items', 'Defend'];
    this.actions = [];
    this.activeCharacter = null;
    
    // Menu positioning
    this.menuWidth = 300;
    this.menuHeight = 200;
    
    // Colors
    this.colors = {
      bg: 'rgba(30, 25, 45, 0.95)',
      border: '#c9a',
      highlight: 'rgba(255, 215, 0, 0.2)',
      text: '#f8f4e8',
      textDim: '#aaa',
      apGold: '#ffd700',
      disabled: '#666'
    };

    if (this.canvas) {
      this.setupInput();
    }
  }

  setupInput() {
    this.keyBuffer = [];
    
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      
      switch(e.key) {
        case 'ArrowUp':
        case 'w':
          this.navigate(-1);
          break;
        case 'ArrowDown':
        case 's':
          this.navigate(1);
          break;
        case 'ArrowLeft':
        case 'a':
          this.navigateCategory(-1);
          break;
        case 'ArrowRight':
        case 'd':
          this.navigateCategory(1);
          break;
        case 'Enter':
        case ' ':
          this.select();
          break;
        case 'Escape':
        case 'Backspace':
          this.close();
          break;
      }
      
      // Prevent repeat on held keys
      if (this.keyBuffer.includes(e.key)) return;
      this.keyBuffer.push(e.key);
    });

    window.addEventListener('keyup', (e) => {
      const index = this.keyBuffer.indexOf(e.key);
      if (index > -1) {
        this.keyBuffer.splice(index, 1);
      }
    });

    // Mouse support
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isOpen) return;
      this.handleMouseMove(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('click', () => {
      if (this.isOpen) {
        this.select();
      }
    });
  }

  open(character) {
    if (!character && window.__game && window.__game.party && window.__game.party.length > 0) {
      // Fallback: use first active party member
      character = window.__game.party.find(c => !c.isDead);
    }
    
    if (!character) {
      console.error('BattleMenu.open(): No character provided and no active party member found');
      return;
    }
    
    this.isOpen = true;
    this.activeCharacter = character;
    this.selectedCategory = 0;
    this.selectedAction = 0;
    
    // Build action list based on character class
    this.buildActions();
    
    events.emit(Events.MENU_OPENED, {});
  }

  close() {
    this.isOpen = false;
    this.activeCharacter = null;
    events.emit(Events.MENU_CLOSED, {});
  }

  buildActions() {
    this.actions = [];
    
    // Attack category
    this.actions.push({
      category: 'Attack',
      items: [
        { name: 'Basic Attack', type: 'attack', apCost: 0, description: 'Builds AP' }
      ]
    });

    // Skills category
    const skills = this.activeCharacter?.skills || [];
    this.actions.push({
      category: 'Skills',
      items: skills.map(skill => ({
        name: skill.name,
        type: 'skill',
        skillId: skill.id,
        apCost: skill.apCost,
        description: skill.description,
        element: skill.element
      }))
    });

    // Items category (placeholder for now)
    this.actions.push({
      category: 'Items',
      items: [
        { name: 'Potion', type: 'item', apCost: 1, description: 'Restore 30 HP' },
        { name: 'Ether', type: 'item', apCost: 1, description: 'Restore 2 AP' }
      ]
    });

    // Defend category
    this.actions.push({
      category: 'Defend',
      items: [
        { name: 'Dodge', type: 'dodge', apCost: 0, description: 'Skip turn, gain 1 AP' }
      ]
    });
  }

  navigate(direction) {
    const currentCategory = this.actions[this.selectedCategory];
    if (!currentCategory) return;

    this.selectedAction += direction;
    
    // Wrap around
    if (this.selectedAction < 0) {
      this.selectedAction = currentCategory.items.length - 1;
    } else if (this.selectedAction >= currentCategory.items.length) {
      this.selectedAction = 0;
    }

    events.emit(Events.ACTION_SELECTED, { mode: 'navigate' });
  }

  navigateCategory(direction) {
    this.selectedCategory += direction;
    
    // Wrap around
    if (this.selectedCategory < 0) {
      this.selectedCategory = this.actions.length - 1;
    } else if (this.selectedCategory >= this.actions.length) {
      this.selectedCategory = 0;
    }

    this.selectedAction = 0;
    
    events.emit(Events.ACTION_SELECTED, { mode: 'navigate' });
  }

  select() {
    const category = this.actions[this.selectedCategory];
    if (!category) return;

    const action = category.items[this.selectedAction];
    if (!action) return;

    // Check AP cost
    if (action.apCost > 0 && this.activeCharacter.ap < action.apCost) {
      // Not enough AP - play error sound
      return;
    }

    // Execute action
    if (action.type === 'attack') {
      events.emit(Events.ACTION_SELECTED, { 
        action: 'attack',
        character: this.activeCharacter 
      });
      this.close();
    } else if (action.type === 'skill') {
      const skill = this.activeCharacter.skills.find(s => s.id === action.skillId);
      if (skill && skill.canUse(this.activeCharacter)) {
        events.emit(Events.ACTION_SELECTED, { 
          action: 'skill',
          skill: skill,
          character: this.activeCharacter 
        });
        this.close();
      }
    } else if (action.type === 'dodge') {
      events.emit(Events.ACTION_SELECTED, { 
        action: 'dodge',
        character: this.activeCharacter 
      });
      this.close();
    }
  }

  handleMouseMove(x, y) {
    if (!this.isOpen) return;

    const menuX = window.innerWidth - this.menuWidth - 30;
    const menuY = window.innerHeight - this.menuHeight - 150;

    // Check if mouse is over menu
    if (x >= menuX && x <= menuX + this.menuWidth &&
        y >= menuY && y <= menuY + this.menuHeight) {
      // Could implement hover selection here
    }
  }

  render() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Menu position (bottom right)
    const menuX = width - this.menuWidth - 30;
    const menuY = height - this.menuHeight - 150;

    // Background
    ctx.fillStyle = this.colors.bg;
    this.roundRect(ctx, menuX, menuY, this.menuWidth, this.menuHeight, 10);
    ctx.fill();

    // Border
    ctx.strokeStyle = this.colors.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Title
    ctx.fillStyle = this.colors.text;
    ctx.font = 'bold 16px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.activeCharacter?.name || 'Character'} - Actions`, menuX + this.menuWidth / 2, menuY + 25);

    // Category tabs
    const tabWidth = this.menuWidth / 4;
    const tabHeight = 30;
    
    this.actions.forEach((category, index) => {
      const tabX = menuX + index * tabWidth;
      const tabY = menuY + 40;

      // Tab background
      if (index === this.selectedCategory) {
        ctx.fillStyle = this.colors.highlight;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      }
      
      ctx.fillRect(tabX + 2, tabY, tabWidth - 4, tabHeight);

      // Tab text
      ctx.fillStyle = index === this.selectedCategory ? this.colors.apGold : this.colors.textDim;
      ctx.font = 'bold 13px Georgia, serif';
      ctx.fillText(category.category, tabX + tabWidth / 2, tabY + 20);
    });

    // Action list
    const currentCategory = this.actions[this.selectedCategory];
    if (currentCategory) {
      const itemHeight = 45;
      const listStartY = menuY + 80;

      currentCategory.items.forEach((item, index) => {
        const itemY = listStartY + index * itemHeight;
        
        // Item background
        if (index === this.selectedAction) {
          ctx.fillStyle = this.colors.highlight;
          this.roundRect(ctx, menuX + 10, itemY, this.menuWidth - 20, itemHeight - 5, 6);
          ctx.fill();
        }

        // Check AP availability
        const canAfford = this.activeCharacter && this.activeCharacter.ap >= item.apCost;
        const textAlpha = canAfford ? 1 : 0.5;

        // Action name
        ctx.fillStyle = canAfford ? this.colors.text : this.colors.disabled;
        ctx.font = 'bold 14px Georgia, serif';
        ctx.textAlign = 'left';
        ctx.fillText(item.name, menuX + 20, itemY + 18);

        // AP cost
        if (item.apCost > 0) {
          ctx.fillStyle = this.colors.apGold;
          ctx.font = '12px sans-serif';
          ctx.fillText(`-${item.apCost} AP`, menuX + this.menuWidth - 50, itemY + 18);
        }

        // Description
        ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha * 0.7})`;
        ctx.font = '11px sans-serif';
        
        // Word wrap description
        const maxWidth = this.menuWidth - 60;
        const words = item.description.split(' ');
        let line = '';
        let lineY = itemY + 32;

        for (const word of words) {
          const testLine = line + word + ' ';
          if (ctx.measureText(testLine).width > maxWidth && line !== '') {
            ctx.fillText(line.trim(), menuX + 20, lineY);
            line = word + ' ';
            lineY += 14;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), menuX + 20, lineY);

        // Element indicator
        if (item.element) {
          const elementColors = {
            fire: '#ff5722',
            water: '#2196f3',
            wind: '#4caf50',
            earth: '#795548',
            light: '#ffeb3b',
            dark: '#9c27b0'
          };
          
          ctx.fillStyle = elementColors[item.element] || '#fff';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(item.element.toUpperCase(), menuX + this.menuWidth - 50, itemY + 35);
        }
      });
    }

    // Controls hint
    ctx.fillStyle = this.colors.textDim;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Arrow Keys/WASD to navigate, Enter to select, Esc to cancel', menuX + this.menuWidth / 2, menuY + this.menuHeight - 15);

    ctx.textAlign = 'left';
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

export const battleMenu = new BattleMenu();
