// A demo project, so the first visit shows something real instead of an empty
// editor. The "screenshots" are a made-up habit tracker, drawn here in code.

import { type Project, newProject, newSlide } from './project';

const W = 1206;
const H = 2622;
const INK = '#14161c';
const MUTED = '#7b8190';
const CARD = '#ffffff';
const BG = '#f3f4f8';
const COLORS = ['#ff6b5e', '#ffb340', '#34c77b', '#4b8cff', '#a66bff'];
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif';

type Ctx = CanvasRenderingContext2D;

function base(ctx: Ctx, title: string) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.font = `600 46px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('9:41', 120, 92);
  // battery and signal, roughly
  ctx.fillRect(W - 210, 78, 18, 28);
  ctx.fillRect(W - 182, 70, 18, 36);
  ctx.beginPath();
  ctx.roundRect(W - 150, 74, 70, 34, 9);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillRect(W - 144, 80, 52, 22);
  ctx.font = `800 96px ${FONT}`;
  ctx.fillText(title, 64, 300);
}

function card(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.shadowColor = 'rgba(20,22,28,0.08)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = CARD;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 44);
  ctx.fill();
  ctx.restore();
}

function today(ctx: Ctx) {
  base(ctx, 'Today');
  // progress ring
  card(ctx, 64, 400, W - 128, 420);
  ctx.lineWidth = 46;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#eceef3';
  ctx.beginPath();
  ctx.arc(300, 610, 130, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = COLORS[2];
  ctx.beginPath();
  ctx.arc(300, 610, 130, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.72);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `800 80px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('72%', 300, 612);
  ctx.textAlign = 'left';
  ctx.font = `700 60px ${FONT}`;
  ctx.fillText('5 of 7 done', 520, 570);
  ctx.fillStyle = MUTED;
  ctx.font = `500 44px ${FONT}`;
  ctx.fillText('Two more to go', 520, 650);

  const habits = ['Morning run', 'Read 20 pages', 'Drink water', 'Meditate', 'Stretch', 'No phone in bed', 'Journal'];
  habits.forEach((name, i) => {
    const y = 880 + i * 230;
    card(ctx, 64, y, W - 128, 200);
    ctx.fillStyle = COLORS[i % COLORS.length] + '22';
    ctx.beginPath();
    ctx.arc(170, y + 100, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.beginPath();
    ctx.arc(170, y + 100, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `600 52px ${FONT}`;
    ctx.fillText(name, 260, y + 82);
    ctx.fillStyle = MUTED;
    ctx.font = `500 38px ${FONT}`;
    ctx.fillText(`${(i * 7 + 3) % 30 + 4} day streak`, 260, y + 136);
    const done = i < 5;
    ctx.lineWidth = 8;
    ctx.strokeStyle = done ? COLORS[2] : '#d5d8e0';
    ctx.fillStyle = done ? COLORS[2] : 'transparent';
    ctx.beginPath();
    ctx.arc(W - 170, y + 100, 44, 0, Math.PI * 2);
    if (done) ctx.fill();
    else ctx.stroke();
    if (done) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(W - 192, y + 100);
      ctx.lineTo(W - 176, y + 118);
      ctx.lineTo(W - 146, y + 84);
      ctx.stroke();
    }
  });
}

function stats(ctx: Ctx) {
  base(ctx, 'Progress');
  card(ctx, 64, 400, W - 128, 900);
  ctx.fillStyle = INK;
  ctx.font = `700 56px ${FONT}`;
  ctx.fillText('This week', 130, 500);
  ctx.fillStyle = MUTED;
  ctx.font = `500 42px ${FONT}`;
  ctx.fillText('86% completion, best yet', 130, 570);
  const values = [0.55, 0.7, 0.62, 0.9, 0.78, 1, 0.86];
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  values.forEach((v, i) => {
    const x = 150 + i * 135;
    const h = 520 * v;
    ctx.fillStyle = i === 5 ? COLORS[3] : COLORS[3] + '55';
    ctx.beginPath();
    ctx.roundRect(x, 1180 - h, 80, h, 24);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'center';
    ctx.font = `600 40px ${FONT}`;
    ctx.fillText(days[i], x + 40, 1240);
    ctx.textAlign = 'left';
  });
  const tiles: [string, string, string][] = [['42', 'days', 'Longest streak'], ['318', 'check-ins', 'All time'], ['7', 'habits', 'Active']];
  tiles.forEach(([big, unit, label], i) => {
    const y = 1360 + i * 300;
    card(ctx, 64, y, W - 128, 260);
    ctx.fillStyle = COLORS[i];
    ctx.font = `800 110px ${FONT}`;
    ctx.fillText(big, 130, y + 140);
    const bw = ctx.measureText(big).width;
    ctx.fillStyle = INK;
    ctx.font = `600 48px ${FONT}`;
    ctx.fillText(unit, 150 + bw, y + 150);
    ctx.fillStyle = MUTED;
    ctx.font = `500 40px ${FONT}`;
    ctx.fillText(label, 130, y + 210);
  });
}

function streaks(ctx: Ctx) {
  base(ctx, 'Streaks');
  card(ctx, 64, 400, W - 128, 1500);
  ctx.fillStyle = INK;
  ctx.font = `700 56px ${FONT}`;
  ctx.fillText('October', 130, 500);
  const cols = 7;
  const size = 118;
  for (let i = 0; i < 35; i++) {
    const x = 130 + (i % cols) * (size + 14);
    const y = 580 + Math.floor(i / cols) * (size + 14);
    const level = (i * 37 + 11) % 5;
    ctx.fillStyle = level === 0 ? '#eceef3' : COLORS[2] + ['', '44', '88', 'bb', 'ff'][level];
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 26);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  ctx.font = `800 140px ${FONT}`;
  ctx.fillText('🔥 21', 130, 1430);
  ctx.fillStyle = MUTED;
  ctx.font = `500 46px ${FONT}`;
  ctx.fillText('days in a row on Morning run', 130, 1540);
  ctx.fillText('Your best: 42 days', 130, 1610);
}

function reminders(ctx: Ctx) {
  base(ctx, 'Reminders');
  const rows: [string, string, boolean][] = [
    ['Morning run', '07:00, weekdays', true], ['Read 20 pages', '21:30, every day', true],
    ['Drink water', 'Every 2 hours', false], ['Meditate', '08:15, every day', true],
    ['Journal', '22:00, every day', false], ['Quiet hours', '23:00 to 07:00', true],
  ];
  rows.forEach(([name, when, on], i) => {
    const y = 400 + i * 250;
    card(ctx, 64, y, W - 128, 220);
    ctx.fillStyle = INK;
    ctx.font = `600 54px ${FONT}`;
    ctx.fillText(name, 130, y + 90);
    ctx.fillStyle = MUTED;
    ctx.font = `500 40px ${FONT}`;
    ctx.fillText(when, 130, y + 150);
    ctx.fillStyle = on ? COLORS[2] : '#d5d8e0';
    ctx.beginPath();
    ctx.roundRect(W - 290, y + 70, 170, 90, 45);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(on ? W - 165 : W - 245, y + 115, 38, 0, Math.PI * 2);
    ctx.fill();
  });
}

const SCREENS = [today, stats, streaks, reminders];

const CAPTIONS = [
  { en: ['Build habits that stick', 'Small steps, every single day'], tr: ['Kalıcı alışkanlıklar edin', 'Her gün küçük adımlar'] },
  { en: ['See your progress', 'Weekly charts that keep you honest'], tr: ['İlerlemeni gör', 'Seni dürüst tutan haftalık grafikler'] },
  { en: ['Never break the chain', 'Your streaks at a glance'], tr: ['Zinciri asla kırma', 'Serilerin tek bakışta'] },
  { en: ['Reminders that respect you', 'Gentle nudges, only when you want them'], tr: ['Saygılı hatırlatıcılar', 'Sadece istediğinde, nazik dürtmeler'] },
];

export async function sampleProject(): Promise<{ project: Project; blobs: Map<string, Blob> }> {
  const project = newProject();
  project.name = 'Daybreak (demo)';
  project.languages = ['en', 'tr'];
  const blobs = new Map<string, Blob>();
  for (let i = 0; i < SCREENS.length; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    SCREENS[i](canvas.getContext('2d')!);
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
    const slide = newSlide('en', ...CAPTIONS[i].en as [string, string]);
    slide.captions.tr = { title: CAPTIONS[i].tr[0], subtitle: CAPTIONS[i].tr[1] };
    if (i === 2) slide.layout = 'tilted';
    const id = `sample-${i}`;
    slide.images['*'] = id;
    blobs.set(id, blob);
    project.slides.push(slide);
  }
  return { project, blobs };
}
