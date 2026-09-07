/**
 * Attack / skill / aim / item selection menu.
 * HTML overlay with art nouveau styling.
 */

export class BattleMenu {
  constructor(container) {
    this.container = container;
    this._visible = false;
    this._selectedIndex = 0;
    this._items = [];
    this._onSelect = null;
    this._onCancel = null;
    this._subMenu = null; // 'target' or 'ally' sub-menu

    this._buildDOM();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: none; flex-direction: column; align-items: center; gap: 6px;
      pointer-events: auto; z-index: 1000;
    `;

    // Menu background panel
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      background: linear-gradient(135deg, rgba(15,15,35,0.92), rgba(25,20,50,0.95));
      border: 2px solid rgba(200,170,100,0.5);
      border-radius: 8px; padding: 12px 20px;
      min-width: 280px; max-width: 400px;
      box-shadow: 0 0 20px rgba(200,170,100,0.15), inset 0 0 30px rgba(0,0,0,0.3);
    `;

    // Ornamental top border
    const ornament = document.createElement('div');
    ornament.style.cssText = `
      height: 2px; margin: -12px -20px 8px -20px;
      background: linear-gradient(90deg, transparent, rgba(200,170,100,0.6), transparent);
    `;
    this.panel.appendChild(ornament);

    // Menu items container
    this.itemsContainer = document.createElement('div');
    this.itemsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    this.panel.appendChild(this.itemsContainer);
    this.el.appendChild(this.panel);
    this.container.appendChild(this.el);
  }

  show(items, onSelect, onCancel) {
    this._items = items;
    this._onSelect = onSelect;
    this._onCancel = onCancel;
    this._selectedIndex = 0;
    this._subMenu = null;
    this._visible = true;
    this.el.style.display = 'flex';
    this._render();
  }

  hide() {
    this._visible = false;
    this.el.style.display = 'none';
    this._subMenu = null;
  }

  get visible() { return this._visible; }

  select() {
    if (!this._visible || this._items.length === 0) return;
    const item = this._items[this._selectedIndex];
    if (item.submenu) {
      // Open sub-menu
      this._subMenu = item.submenu;
      this._items = item.submenu;
      this._selectedIndex = 0;
      this._render();
      return;
    }
    if (this._onSelect) this._onSelect(item);
    this.hide();
  }

  moveUp() {
    if (!this._visible) return;
    this._selectedIndex = (this._selectedIndex - 1 + this._items.length) % this._items.length;
    this._render();
  }

  moveDown() {
    if (!this._visible) return;
    this._selectedIndex = (this._selectedIndex + 1) % this._items.length;
    this._render();
  }

  cancel() {
    if (this._subMenu) {
      // Go back to parent menu — caller handles this
    }
    if (this._onCancel) this._onCancel();
    this.hide();
  }

  _render() {
    this.itemsContainer.innerHTML = '';
    this._items.forEach((item, i) => {
      const el = document.createElement('div');
      const selected = i === this._selectedIndex;
      const isDisabled = item.disabled;

      // Determine AP cost color: green = affordable, red = too expensive
      let apCostColor = '#6688cc'; // default blue
      if (item.apCost !== undefined && item.apCost > 0) {
        apCostColor = isDisabled ? '#ff4444' : '#44dd66';
      }

      el.style.cssText = `
        padding: 8px 14px; cursor: ${isDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;
        background: ${selected ? 'rgba(200,170,100,0.2)' : 'transparent'};
        border: 1px solid ${selected ? 'rgba(200,170,100,0.6)' : 'rgba(200,170,100,0.1)'};
        color: ${isDisabled ? '#665544' : (selected ? '#ffd700' : '#c8b888')};
        font: ${selected ? 'bold' : 'normal'} 14px serif;
        transition: all 0.15s;
        display: flex; justify-content: space-between; align-items: center;
        opacity: ${isDisabled ? '0.45' : '1'};
      `;

      // Left side: icon + name
      const leftSide = document.createElement('span');
      leftSide.style.cssText = 'display: flex; align-items: center; gap: 6px;';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.name;
      leftSide.appendChild(nameSpan);

      // AP cost badge
      if (item.apCost !== undefined && item.apCost > 0) {
        const costSpan = document.createElement('span');
        costSpan.textContent = `AP ${item.apCost}`;
        costSpan.style.cssText = `
          color: ${apCostColor}; font-size: 11px; font-weight: bold;
          padding: 1px 6px; border-radius: 3px;
          background: ${isDisabled ? 'rgba(255,50,50,0.15)' : 'rgba(50,200,80,0.1)'};
          border: 1px solid ${isDisabled ? 'rgba(255,50,50,0.3)' : 'rgba(50,200,80,0.3)'};
        `;
        leftSide.appendChild(costSpan);
      }

      el.appendChild(leftSide);

      // Right side: description
      if (item.description) {
        const descSpan = document.createElement('span');
        descSpan.textContent = item.description;
        descSpan.style.cssText = 'color: #887755; font-size: 10px; margin-left: 8px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        el.appendChild(descSpan);
      }

      if (!isDisabled) {
        el.addEventListener('click', () => {
          this._selectedIndex = i;
          this.select();
        });
        el.addEventListener('mouseenter', () => {
          this._selectedIndex = i;
          this._render();
        });
      }

      this.itemsContainer.appendChild(el);
    });
  }
}
