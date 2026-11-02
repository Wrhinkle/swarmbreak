import { generateAct, exitReachable } from './generator';
import html from '../snapshots/wikipedia-volcano.html?raw';

const act = generateAct(html, 'https://en.wikipedia.org/wiki/Volcano');
document.querySelector('#title')!.textContent = act.title;
document.querySelector('#status')!.textContent = `${act.rooms.length} rooms · Exit reachable: ${exitReachable(act) ? 'yes' : 'no'}`;
const roomList = document.querySelector('#room-list')!;
for (const room of act.rooms) {
  const connectedIds = new Set<number>();
  for (const path of act.paths) {
    if (path.from === room.id) connectedIds.add(path.to);
    if (path.to === room.id) connectedIds.add(path.from);
  }
  const connections = act.rooms.filter(other => connectedIds.has(other.id)).map(other => other.name);
  const item = document.createElement('li');
  item.textContent = `${room.name} (${room.kind}). Connects to: ${connections.join(', ') || 'none'}.`;
  roomList.appendChild(item);
}
const canvas = document.querySelector('canvas')!;
const padding = 40;
canvas.width = Math.max(...act.rooms.map(r => r.x + r.width)) + padding * 2;
canvas.height = Math.max(...act.rooms.map(r => r.y + r.height)) + padding * 2;
const ctx = canvas.getContext('2d')!;
ctx.translate(padding, padding);
for (const path of act.paths) {
  const a = act.rooms[path.from], b = act.rooms[path.to];
  ctx.beginPath(); ctx.moveTo(a.x + a.width / 2, a.y + a.height / 2); ctx.lineTo(b.x + b.width / 2, b.y + b.height / 2);
  ctx.strokeStyle = path.shortcut ? '#b694dd' : '#7e9bab'; ctx.lineWidth = path.shortcut ? 2 : 3;
  ctx.setLineDash(path.shortcut ? [6, 5] : []); ctx.stroke();
}
ctx.setLineDash([]);
for (const room of act.rooms) {
  ctx.fillStyle = room.kind === 'entrance' ? '#235d51' : room.kind === 'exit' ? '#75512d' : '#273e50';
  ctx.strokeStyle = room.kind === 'entrance' ? '#6ee7bc' : room.kind === 'exit' ? '#ffd17c' : '#7798ad';
  ctx.lineWidth = 2; ctx.fillRect(room.x, room.y, room.width, room.height); ctx.strokeRect(room.x, room.y, room.width, room.height);
  ctx.save(); ctx.beginPath(); ctx.rect(room.x + 8, room.y + 5, room.width - 16, room.height - 10); ctx.clip();
  ctx.fillStyle = '#f2f6f8'; ctx.font = 'bold 14px system-ui';
  const words = room.name.split(/\s+/); const lines: string[] = []; let line = '';
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (line && ctx.measureText(next).width > room.width - 20) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line);
  const maxLines = Math.floor((room.height - 36) / 18);
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    let text = lines[i];
    if (i === maxLines - 1 && lines.length > maxLines) text += '…';
    while (ctx.measureText(text).width > room.width - 20 && text.length > 1) text = text.slice(0, -2) + '…';
    ctx.fillText(text, room.x + 10, room.y + 25 + i * 18);
  }
  if (room.kind === 'entrance' || room.kind === 'exit') { ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.fillText(room.kind.toUpperCase(), room.x + 10, room.y + room.height - 10); }
  ctx.restore();
}
