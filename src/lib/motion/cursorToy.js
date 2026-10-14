// A visual cursor only. Browser/OS coordinates and click targets are never changed.
export function createCursorToy(root) {
  const ghost = root.parentElement.querySelector('.cat-cursor-toy');
  let active = false;
  function paint(point, angle = 0) {
    ghost.style.transform = `translate3d(${point.x}px,${point.y}px,0) rotate(${angle}deg)`;
  }
  return {
    get active() {
      return active;
    },
    begin(point) {
      active = true;
      paint(point);
      ghost.hidden = false;
      document.documentElement.setAttribute('data-cat-cursor-hidden', 'true');
      root.dataset.cursorPlay = 'true';
    },
    paint,
    end() {
      active = false;
      ghost.hidden = true;
      ghost.style.transform = '';
      document.documentElement.removeAttribute('data-cat-cursor-hidden');
      root.removeAttribute('data-cursor-play');
    },
  };
}
