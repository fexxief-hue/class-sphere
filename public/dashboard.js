let csrfToken = '';
let dashboardData = null;
let activeCategory = 'timetable';
let activePopupItem = null;
const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const zoneOptions = { timeZone: 'Africa/Nairobi' };

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
async function secureFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.method && !['GET','HEAD','OPTIONS'].includes(options.method.toUpperCase())) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.location.assign('/login.html');
    throw new Error(data.error || 'The request could not be completed.');
  }
  return data;
}
async function renewCsrf() {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Secure session unavailable.');
  csrfToken = data.csrfToken;
}
function timezoneParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    ...zoneOptions, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}
function classDateFromOffset(parts, offset) {
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset));
  return date.toISOString().slice(0, 10);
}
function findNextClass(schedule, timezone) {
  if (!schedule.length) return null;
  const now = new Date();
  const parts = timezoneParts(now);
  const today = parts.weekday;
  const todayIndex = weekdays.indexOf(today);
  const nowTime = parts.hour + ':' + parts.minute;
  const todayEntries = schedule.filter((entry) => entry.day === today).sort((a,b) => a.startsAt.localeCompare(b.startsAt));
  const current = todayEntries.find((entry) => entry.startsAt <= nowTime && entry.endsAt > nowTime);
  if (current) return { entry: current, classDate: classDateFromOffset(parts, 0), current: true, minutesUntil: 0 };
  const laterToday = todayEntries.find((entry) => entry.startsAt > nowTime);
  if (laterToday) {
    const minutesUntil = Number(laterToday.startsAt.slice(0,2))*60 + Number(laterToday.startsAt.slice(3,5)) - Number(parts.hour)*60 - Number(parts.minute);
    return { entry: laterToday, classDate: classDateFromOffset(parts, 0), current: false, minutesUntil };
  }
  let best = null;
  for (const entry of schedule) {
    const dayIndex = weekdays.indexOf(entry.day);
    const offset = (dayIndex - todayIndex + 7) % 7 || 7;
    if (!best || offset < best.offset || (offset === best.offset && entry.startsAt < best.entry.startsAt)) best = { entry, offset };
  }
  if (!best) return null;
  return { entry: best.entry, classDate: classDateFromOffset(parts, best.offset), current: false, minutesUntil: Infinity };
}
function popupStateFor(next) {
  if (!next || !dashboardData) return null;
  return dashboardData.popupStates.find((state) => Number(state.timetableEntryId) === Number(next.entry.id) && state.classDate === next.classDate) || null;
}
function isQuietNow(preferences) {
  if (!preferences.quietStart || !preferences.quietEnd) return false;
  const parts = timezoneParts();
  const now = parts.hour + ':' + parts.minute;
  if (preferences.quietStart < preferences.quietEnd) return now >= preferences.quietStart && now < preferences.quietEnd;
  return now >= preferences.quietStart || now < preferences.quietEnd;
}
function categoryEnabled(category) {
  const key = category === 'event' ? 'event' : category;
  return !dashboardData || dashboardData.preferences[key] !== false;
}
function renderClassBlock(entry, label) {
  const box = node('div','next-class-box');
  box.append(node('div','next-class-label',label));
  box.append(node('div','next-class-name',entry.code + ' · ' + entry.name));
  const detail = [entry.day + ' · ' + entry.startsAt + '–' + entry.endsAt + ' (Africa/Nairobi)'];
  detail.push(entry.lecturer || 'Lecturer unspecified');
  detail.push(entry.venue || 'Venue unspecified');
  if (entry.classType) detail.push(entry.classType[0].toUpperCase() + entry.classType.slice(1));
  box.append(node('div','next-class-meta',detail.join(' · ')));
  return box;
}
function renderNextSummary() {
  const target = document.getElementById('next-class-summary');
  const next = findNextClass(dashboardData.schedule, dashboardData.timezone);
  target.replaceChildren();
  if (!next) {
    target.textContent = 'No timetable entries are available yet.';
    return;
  }
  activePopupItem = { type: 'class', ...next };
  target.append(renderClassBlock(next.entry, next.current ? 'IN CLASS NOW' : 'UP NEXT'));
  const clock=node('div','live-countdown');const end=next.current?next.entry.endsAt:next.entry.startsAt;const targetTime=new Date(next.classDate+'T'+end+':00+03:00');clock.dataset.target=String(targetTime.getTime());clock.dataset.label=next.current?'Class ends in':'Starts in';target.append(clock);updateCountdown(clock);
}
function renderTimetable() {
  const target = document.getElementById('timetable-list');
  const select = document.getElementById('timetable-day');
  const today = timezoneParts().weekday;
  if (select.options.length && [...select.options].some((o) => o.value === today)) select.value = today;
  const day = select.value;
  const entries = dashboardData.schedule.filter((entry) => entry.day === day).sort((a,b) => a.startsAt.localeCompare(b.startsAt));
  target.replaceChildren();
  if (!entries.length) {
    target.textContent = 'No classes are scheduled for ' + day + '.';
    return;
  }
  const parts = timezoneParts();
  const time = parts.hour + ':' + parts.minute;
  for (const entry of entries) {
    const row = node('article','schedule-row');
    const timeBlock = node('div','schedule-time',entry.startsAt + '–' + entry.endsAt);
    const info = node('div','schedule-info');
    info.append(node('strong','',entry.code + ' · ' + entry.name));
    info.append(node('span','', (entry.lecturer || 'Lecturer unspecified') + ' · ' + (entry.venue || 'Venue unspecified')));
    let status = 'Scheduled';
    if (day === today) {
      if (entry.startsAt <= time && entry.endsAt > time) status = 'Current';
      else if (entry.endsAt <= time) status = 'Completed';
      else status = 'Upcoming';
    }
    row.append(timeBlock,info,node('span','schedule-status '+status.toLowerCase(),status));
    target.append(row);
  }
}
function notificationIsVisible(item) {
  if (item.dismissedAt) return false;
  if (item.snoozedUntil && new Date(item.snoozedUntil).getTime() > Date.now()) return false;
  return true;
}
function categoryItems(category) {
  const notifications = dashboardData.notifications.filter((item) => item.category === category && notificationIsVisible(item));
  const announcements = dashboardData.announcements.filter((item) => item.category === category);
  return { notifications, announcements };
}
function renderCategory(category) {
  activeCategory = category;
  const target = document.getElementById('student-popup-content');
  for (const button of document.querySelectorAll('[data-dashboard-category]')) {
    const active = button.dataset.dashboardCategory === category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  target.replaceChildren();
  activePopupItem = null;
  let hasContent = false;
  if (category === 'timetable') {
    const next = findNextClass(dashboardData.schedule, dashboardData.timezone);
    if (next) {
      activePopupItem = { type: 'class', ...next };
      target.append(renderClassBlock(next.entry, next.current ? 'IN CLASS NOW' : 'UP NEXT'));
      hasContent = true;
    }
  }
  const items = categoryItems(category);
  const all = [
    ...items.notifications.map((item) => ({ ...item, itemType: 'notification' })),
    ...items.announcements.map((item) => ({ ...item, itemType: 'announcement' })),
  ].sort((a,b) => new Date(b.createdAt || b.publishedAt || 0)-new Date(a.createdAt || a.publishedAt || 0));
  if (all.length) {
    const list = node('div', 'popup-notices');
    for (const item of all) {
      const card = node('article', 'popup-notice');
      const titleRow = node('div', 'popup-notice-title');
      titleRow.append(node('strong', '', item.title));
      if (item.priority === 'urgent') titleRow.append(node('span', 'urgent-badge', 'Urgent'));
      card.append(titleRow, node('p', '', item.body));
      card.append(node('small', '', new Date(item.publishedAt || item.createdAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })));
      if (item.itemType === 'notification') {
        if (!activePopupItem) activePopupItem = { type: 'notification', id: item.id };
        const actions = node('div', 'popup-actions');
        if (!item.readAt) {
          const read = node('button', 'btn btn-sm btn-outline-success rounded-pill', 'Mark read');
          read.type = 'button';
          read.addEventListener('click', () => updateNotification(item.id, 'read'));
          actions.append(read);
        }
        const snooze = node('button', 'btn btn-sm btn-outline-secondary rounded-pill', 'Snooze');
        snooze.type = 'button';
        snooze.addEventListener('click', () => updateNotification(item.id, 'snooze'));
        const dismiss = node('button', 'btn btn-sm btn-outline-secondary rounded-pill', 'Dismiss');
        dismiss.type = 'button';
        dismiss.addEventListener('click', () => updateNotification(item.id, 'dismiss'));
        actions.append(snooze, dismiss);
        card.append(actions);
      }
      list.append(card);
    }
    if (hasContent) target.append(node('hr', 'popup-divider'));
    target.append(list);
    hasContent = true;
  }
  if (!hasContent) target.textContent = category === 'timetable' ? 'No classes or updates are available yet.' : 'No published updates in this category yet.';
}
async function updateNotification(id,action) {
  try {
    await secureFetch('/api/student/notifications/'+id+'/'+action,{method:'POST',body:'{}'});
    await loadDashboard(false);
    renderCategory(activeCategory);
    renderNoticeList();
  } catch (error) { announce(error.message); }
}
function renderNoticeList() {
  const target=document.getElementById('announcement-list');
  const merged=[
    ...dashboardData.notifications.map((item)=>({...item,itemType:'notification',date:item.createdAt})),
    ...dashboardData.announcements.map((item)=>({...item,itemType:'announcement',date:item.publishedAt})),
  ].sort((a,b)=>new Date(b.date)-new Date(a.date));
  target.replaceChildren();
  if (!merged.length) { target.textContent='No announcements or notifications have been published for your account yet.'; return; }
  for (const item of merged) {
    if (item.itemType==='notification' && item.dismissedAt) continue;
    const card=node('article','notice-card');
    const top=node('div','notice-card-top');
    top.append(node('span','category-pill',item.category));
    if (item.priority==='urgent') top.append(node('span','urgent-badge','Urgent'));
    if (item.itemType==='notification' && !item.readAt) top.append(node('span','unread-dot','Unread'));
    card.append(top,node('h3','',item.title),node('p','',item.body));
    card.append(node('small','',new Date(item.date).toLocaleString('en-GB',{timeZone:'Africa/Nairobi'})));
    if (item.itemType==='notification' && !item.readAt) {
      const button=node('button','btn btn-sm btn-outline-success rounded-pill mt-2','Mark as read');
      button.type='button';button.addEventListener('click',()=>updateNotification(item.id,'read'));card.append(button);
    }
    target.append(card);
  }
}
function renderPreferences() {
  const form=document.getElementById('preferences-form');
  for (const key of ['academic','timetable','event','general']) form.elements[key].checked=dashboardData.preferences[key] !== false;
  form.elements.quietStart.value=dashboardData.preferences.quietStart || '';
  form.elements.quietEnd.value=dashboardData.preferences.quietEnd || '';
}
function announce(message) {
  const live=document.getElementById('notification-summary');
  if (live) live.textContent=message;
}
async function loadDashboard(autoPopup=true) {
  const data=await secureFetch('/api/student/overview');
  dashboardData=data;
  document.getElementById('dash-user').textContent=data.student.fullName;
  document.getElementById('welcome-name').textContent=data.student.fullName.split(' ')[0];
  const unread=data.notifications.filter((item)=>!item.readAt&&!item.dismissedAt);
  document.getElementById('notification-summary').textContent=unread.length ? unread.length+' unread class update'+(unread.length===1?'':'s')+'.' : 'You are up to date.';
  renderNextSummary();
  renderEventCountdowns();
  renderStudentChart();renderStudentPie();
  renderTimetable();
  renderNoticeList();
  renderPreferences();
  if (autoPopup) maybeShowPopup(unread);
}
function maybeShowPopup(unread) {
  const urgent=unread.find((item)=>item.priority==='urgent'&&notificationIsVisible(item));
  if (urgent) {
    renderCategory(urgent.category);
    activePopupItem = { type: 'notification', id: urgent.id };
    const modal=bootstrap.Modal.getOrCreateInstance(document.getElementById('studentInfoModal'));
    modal.show();
    return;
  }
  const next=findNextClass(dashboardData.schedule,dashboardData.timezone);
  if (!next || !categoryEnabled('timetable') || isQuietNow(dashboardData.preferences)) return;
  const state=popupStateFor(next);
  if (state && (state.dismissedAt || (state.snoozedUntil && new Date(state.snoozedUntil).getTime()>Date.now()))) return;
  if (next.current || next.minutesUntil<=45) {
    renderCategory('timetable');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('studentInfoModal')).show();
  }
}
async function loadCsrfAndMe() {
  await renewCsrf();
  const me=await secureFetch('/api/auth/me');
  document.getElementById('dash-user').textContent=me.fullName;
  const featureStatus=await secureFetch('/api/auth/status');
  const studyButton=document.getElementById('study-submit');
  if(featureStatus.adminAiAvailable){studyButton.disabled=false;studyButton.textContent='Ask assistant';document.getElementById('study-answer').textContent='AI study support is available. Verify course-specific information with your materials.';}

}
document.getElementById('open-class-popup').addEventListener('click',()=>{renderCategory('timetable');bootstrap.Modal.getOrCreateInstance(document.getElementById('studentInfoModal')).show();});
document.getElementById('open-notifications').addEventListener('click',()=>document.getElementById('announcements').scrollIntoView({behavior:'smooth'}));
for (const button of document.querySelectorAll('[data-dashboard-category]')) button.addEventListener('click',()=>renderCategory(button.dataset.dashboardCategory));
document.getElementById('timetable-day').addEventListener('change',renderTimetable);
document.getElementById('popup-dismiss').addEventListener('click',async()=>{
  if (!activePopupItem) return bootstrap.Modal.getOrCreateInstance(document.getElementById('studentInfoModal')).hide();
  try {
    if (activePopupItem.type==='class') await secureFetch('/api/student/class-popup/'+activePopupItem.entry.id+'/dismiss',{method:'POST',body:JSON.stringify({classDate:activePopupItem.classDate})});
    else if (activePopupItem.type==='notification') await secureFetch('/api/student/notifications/'+activePopupItem.id+'/dismiss',{method:'POST',body:'{}'});
    await loadDashboard(false);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('studentInfoModal')).hide();
  } catch(error){announce(error.message);}
});
document.getElementById('popup-snooze').addEventListener('click',async()=>{
  if (!activePopupItem) return;
  try {
    if (activePopupItem.type==='class') await secureFetch('/api/student/class-popup/'+activePopupItem.entry.id+'/snooze',{method:'POST',body:JSON.stringify({classDate:activePopupItem.classDate})});
    else if (activePopupItem.type==='notification') await secureFetch('/api/student/notifications/'+activePopupItem.id+'/snooze',{method:'POST',body:'{}'});
    await loadDashboard(false);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('studentInfoModal')).hide();
  } catch(error){announce(error.message);}
});
document.getElementById('preferences-form').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const form=event.currentTarget;
  const body={academic:form.elements.academic.checked,timetable:form.elements.timetable.checked,event:form.elements.event.checked,general:form.elements.general.checked,quietStart:form.elements.quietStart.value,quietEnd:form.elements.quietEnd.value};
  try {const result=await secureFetch('/api/student/preferences',{method:'PUT',body:JSON.stringify(body)});document.getElementById('preferences-message').textContent=result.message;await loadDashboard(false);}
  catch(error){document.getElementById('preferences-message').textContent=error.message;}
});
document.getElementById('logout-button').addEventListener('click',async()=>{
  try {await secureFetch('/api/auth/logout',{method:'POST',body:'{}'});window.location.assign('/login.html');}
  catch(error){announce(error.message);}
});
document.querySelectorAll('.dash-nav[href^="#"]').forEach((link)=>link.addEventListener('click',()=>{document.querySelectorAll('.dash-nav').forEach((item)=>item.classList.remove('active'));link.classList.add('active');document.querySelector('.dash-sidebar').classList.remove('nav-open');document.querySelector('.dash-menu-toggle').setAttribute('aria-expanded','false');}));
document.querySelector('.dash-menu-toggle').addEventListener('click',event=>{const sidebar=document.querySelector('.dash-sidebar');const open=sidebar.classList.toggle('nav-open');event.currentTarget.setAttribute('aria-expanded',String(open));});
function renderStudentChart(){if(!dashboardData)return;const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];const counts=days.map(day=>[day.slice(0,3),dashboardData.schedule.filter(x=>x.day===day).length]);const max=Math.max(1,...counts.map(x=>x[1]));const target=document.getElementById('student-chart-bars');target.replaceChildren();for(const [day,count] of counts){const bar=node('div','chart-bar');bar.title=day+': '+count+' classes';const fill=document.createElement('i');fill.style.setProperty('--bar',Math.max(6,count/max*100)+'%');bar.append(fill,node('small','',day));target.append(bar);}}

function renderStudentPie(){if(!dashboardData)return;const target=document.getElementById('student-class-pie'),legend=document.getElementById('student-class-legend');if(!target||!legend)return;const colors={theory:'#72e6ff',practical:'#f2c969',unspecified:'#a892ff'};const counts=new Map();for(const item of dashboardData.schedule){const key=item.classType||'unspecified';counts.set(key,(counts.get(key)||0)+1);}const total=[...counts.values()].reduce((a,b)=>a+b,0);legend.replaceChildren();if(!total){target.style.background='conic-gradient(#30445d 0 100%)';target.setAttribute('aria-label','No timetable entries available');const empty=node('p','empty-state','No timetable data yet.');legend.append(empty);return;}let cursor=0;const slices=[];for(const [key,count] of counts){const color=colors[key]||'#a892ff',label=key==='theory'?'Theory':key==='practical'?'Practical':'Unspecified';const end=cursor+count/total*100;slices.push(color+' '+cursor+'% '+end+'%');cursor=end;const row=node('div','pie-legend-row'),swatch=node('i','pie-swatch');swatch.style.background=color;row.append(swatch,node('span','',label),node('strong','',String(count)));legend.append(row);}target.style.background='conic-gradient('+slices.join(',')+')';target.setAttribute('aria-label',[...counts].map(([key,count])=>(key==='theory'?'Theory':key==='practical'?'Practical':'Unspecified')+' '+count).join(', '));}
const uploadForm=document.getElementById('student-resource-form');uploadForm.addEventListener('submit',async event=>{event.preventDefault();const status=document.getElementById('student-upload-status');const data=new FormData(uploadForm);status.textContent='Uploading for review…';try{const response=await fetch('/api/student/resources',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrfToken},body:data});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed.');status.textContent=result.message;uploadForm.reset();await loadStudentResources();}catch(e){status.textContent=e.message;}});

(async()=>{
  try {await loadCsrfAndMe();await loadDashboard(true);await loadStudentResources();}
  catch(error){if (!document.getElementById('notification-summary').textContent.includes('Sign in is required')) announce(error.message);}
})();

async function loadStudentResources(){try{const data=await secureFetch("/api/student/resources");const target=document.getElementById("student-resources");target.replaceChildren();if(!data.resources.length){target.textContent="No resources are available yet.";return;}for(const item of data.resources){const row=node("article","notice-card");row.append(node("h3","",item.title),node("p","",item.code+" · "+item.resourceType+" · "+item.filename));const link=node("a","btn btn-outline-success btn-sm rounded-pill","Download");link.href="/api/student/resources/"+item.id+"/download";row.append(link);target.append(row);}}catch(e){document.getElementById("student-resources").textContent=e.message;}}
document.getElementById("study-form").addEventListener("submit",async(event)=>{event.preventDefault();const form=event.currentTarget;const out=document.getElementById("study-answer");out.textContent="Thinking…";try{const result=await secureFetch("/api/student/ai/ask",{method:"POST",body:JSON.stringify({question:form.elements.question.value})});out.textContent=result.answer+"\n\n"+result.disclaimer;}catch(error){out.textContent=error.message;}});


function updateCountdown(el){const target=Number(el.dataset.target),seconds=Math.max(0,Math.floor((target-Date.now())/1000));if(!Number.isFinite(target)){el.textContent='Time to be announced';return;}const d=Math.floor(seconds/86400),h=Math.floor(seconds%86400/3600),m=Math.floor(seconds%3600/60),sec=seconds%60;el.innerHTML='<span>'+el.dataset.label+'</span><strong>'+[d?d+'d':null,h+'h',m+'m',sec+'s'].filter(Boolean).join(' · ')+'</strong>';}
function renderEventCountdowns(){const target=document.getElementById('countdown-list');if(!target||!dashboardData)return;target.replaceChildren();const events=dashboardData.events||[];if(!events.length){target.append(node('p','empty-state','No upcoming CAT or exam dates have been posted.'));return;}for(const event of events){const card=node('article','countdown-card');const type=node('span','countdown-type',event.eventType.toUpperCase());const title=node('strong','',event.title);const time=node('div','event-countdown');const raw=String(event.startsAt);const iso=raw.includes('T')?raw:raw.replace(' ','T')+'Z';time.dataset.target=String(new Date(iso).getTime());time.dataset.label='Starts in';card.append(type,title,time,node('small','',new Date(iso).toLocaleString('en-GB',{timeZone:'Africa/Nairobi'}))); target.append(card);updateCountdown(time);}}
setInterval(()=>document.querySelectorAll('.live-countdown,.event-countdown').forEach(updateCountdown),1000);
