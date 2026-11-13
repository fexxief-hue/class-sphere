let csrfToken = '';
let academicRecords = [];
let timetableEntries = [];
let announcementDrafts = [];
let students = [];
let recipients = [];
const selectedRecipients = new Set();
let editingUnitId = null;
let editingTimetableId = null;
let editingAnnouncementId = null;
let selectedAcademicYear = null;
let selectedAcademicSemester = null;
let selectedAcademicPage = 0;
let selectedTimetableYear = null;
let selectedTimetableSemester = null;
let selectedTimetableDay = null;
let studentFilter = 'pending';

function el(tag, cls, value) {
  const item = document.createElement(tag);
  if (cls) item.className = cls;
  if (value !== undefined) item.textContent = value;
  return item;
}
async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.method && !['GET','HEAD','OPTIONS'].includes(options.method.toUpperCase())) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(url,{credentials:'same-origin',...options,headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===401)location.assign('/admin-login.html');throw new Error(data.error||'The request could not be completed.');}
  return data;
}
async function uploadApi(url,formData){const response=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrfToken},body:formData});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Upload failed.');return data;}
async function startSecureSession(){
  const response=await fetch('/api/auth/csrf');
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Secure session unavailable.');
  csrfToken=data.csrfToken;
}
function message(text,error=false){
  const box=document.getElementById('admin-message');
  box.textContent=text;box.classList.toggle('error',error);
}
function stat(label,value){
  const card=el('article','admin-stat-card');
  card.append(el('div','admin-stat-value',String(value)),el('div','admin-stat-label',label));
  return card;
}
function renderBars(id,values){const target=document.getElementById(id);target.replaceChildren();const max=Math.max(1,...values.map(x=>Number(x[1])||0));for(const [label,value] of values){const bar=el('div','chart-bar');bar.title=label+': '+value;const fill=document.createElement('i');fill.style.setProperty('--bar',Math.max(6,(Number(value)||0)/max*100)+'%');const cap=el('small','',label);bar.append(fill,cap);target.append(bar);}}
function renderPie(chartId,legendId,source,definitions){const chart=document.getElementById(chartId),legend=document.getElementById(legendId);const items=definitions.map(([key,label,color])=>({key,label,color,value:Number(source[key]||0)}));const total=items.reduce((sum,item)=>sum+item.value,0);legend.replaceChildren();if(!total){chart.style.background='conic-gradient(#30445d 0 100%)';chart.setAttribute('aria-label','No student account records');legend.append(el('p','empty-state','No account data yet.'));return;}let cursor=0;const slices=[];for(const item of items){if(!item.value)continue;const next=cursor+item.value/total*100;slices.push(item.color+' '+cursor+'% '+next+'%');cursor=next;const row=el('div','pie-legend-row');const swatch=el('i','pie-swatch');swatch.style.background=item.color;row.append(swatch,el('span','',item.label),el('strong','',String(item.value)));legend.append(row);}chart.style.background='conic-gradient('+slices.join(',')+')';chart.setAttribute('aria-label',items.filter(x=>x.value).map(x=>x.label+' '+x.value).join(', '));}
async function loadOverview(){
  const data=await api('/api/admin/overview');
  const approvalCount=Number(data.pendingEmailVerification)||0;document.getElementById('approval-queue-count').textContent=approvalCount?approvalCount+' waiting · Review →':'Review student accounts →';
  renderBars('admin-chart-bars',[['Students',data.students],['Notices',data.publishedAnnouncements],['Resources',data.resources],['Events',data.upcomingEvents]]);
  renderPie('admin-student-pie','admin-student-legend',data.studentStatuses||{},[['active','Active','#72e6ff'],['pending_email','Awaiting approval','#f2c969'],['suspended','Suspended','#ff8295']]);
  document.getElementById('admin-overview').replaceChildren(
    stat('Registered students',data.students),stat('Pending student sign-ups',data.pendingEmailVerification),
    stat('Published announcements',data.publishedAnnouncements),stat('Academic resources',data.resources),
    stat('Upcoming events',data.upcomingEvents),stat('Emails accepted by provider',data.acceptedEmails));
}
async function loadAcademics(){
  const data=await api('/api/admin/academics');academicRecords=data.records;
  const years=new Map(),semesters=[];
  for(const row of academicRecords){years.set(row.yearId,{id:row.yearId,year:row.year,label:row.yearLabel});if(row.semesterId&&!semesters.some(x=>x.id===row.semesterId))semesters.push({id:row.semesterId,year:row.year,number:row.semester});}
  const yearSelect=document.getElementById('semesterYear');yearSelect.replaceChildren();
  for(const year of [...years.values()].sort((a,b)=>a.year-b.year)){const o=el('option','',year.label);o.value=year.id;yearSelect.append(o);}
  const semesterSelect=document.getElementById('unitSemester');semesterSelect.replaceChildren();
  for(const semester of semesters){const o=el('option','','Year '+semester.year+' · Semester '+semester.number);o.value=semester.id;semesterSelect.append(o);}
  const unitSelect=document.getElementById('timetableUnit');unitSelect.replaceChildren();
  for(const row of academicRecords.filter(x=>x.unitId)){const o=el('option','',row.code+' · '+row.name);o.value=row.unitId;unitSelect.append(o);}
  const resourceUnit=document.getElementById('resourceUnit');if(resourceUnit){resourceUnit.replaceChildren();for(const row of academicRecords.filter(x=>x.unitId)){const o=el('option','',row.code+' · '+row.name);o.value=row.unitId;resourceUnit.append(o);}}
  const availableYears=[...new Set(academicRecords.filter(x=>x.semesterId).map(x=>x.year))].sort((a,b)=>a-b);
  if(!availableYears.length){renderAcademicNavigation();renderAcademics();return;}
  if(!availableYears.includes(selectedAcademicYear))selectedAcademicYear=availableYears.includes(3)?3:availableYears[0];
  const sems=[...new Set(academicRecords.filter(x=>x.year===selectedAcademicYear&&x.semesterId).map(x=>x.semester))].sort((a,b)=>a-b);
  if(!sems.includes(selectedAcademicSemester))selectedAcademicSemester=sems.includes(1)?1:sems[0];
  renderAcademicNavigation();renderAcademics();
}
function renderAcademicNavigation(){
  const yearTarget=document.getElementById('academic-year-buttons'),semTarget=document.getElementById('academic-semester-buttons');yearTarget.replaceChildren();semTarget.replaceChildren();
  const years=[...new Set(academicRecords.filter(x=>x.semesterId).map(x=>x.year))].sort((a,b)=>a-b);
  for(const year of years){const button=el('button','filter-button'+(year===selectedAcademicYear?' active':''),'Year '+year);button.type='button';button.setAttribute('aria-pressed',String(year===selectedAcademicYear));button.addEventListener('click',()=>{selectedAcademicYear=year;selectedAcademicPage=0;const sems=[...new Set(academicRecords.filter(x=>x.year===year&&x.semesterId).map(x=>x.semester))].sort((a,b)=>a-b);selectedAcademicSemester=sems.includes(1)?1:sems[0];renderAcademicNavigation();renderAcademics();});yearTarget.append(button);}
  const semesters=[...new Set(academicRecords.filter(x=>x.year===selectedAcademicYear&&x.semesterId).map(x=>x.semester))].sort((a,b)=>a-b);
  for(const semester of semesters){const button=el('button','filter-button'+(semester===selectedAcademicSemester?' active':''),'Semester '+semester);button.type='button';button.setAttribute('aria-pressed',String(semester===selectedAcademicSemester));button.addEventListener('click',()=>{selectedAcademicSemester=semester;selectedAcademicPage=0;renderAcademicNavigation();renderAcademics();});semTarget.append(button);}
}
function renderAcademics(){
  const target=document.getElementById('academic-list');target.replaceChildren();
  if(selectedAcademicYear==null||selectedAcademicSemester==null){target.textContent='No years or semesters configured yet.';return;}
  const group=academicRecords.filter(row=>row.year===selectedAcademicYear&&row.semester===selectedAcademicSemester&&row.semesterId),units=group.filter(row=>row.unitId),pageSize=5,pageCount=Math.ceil(units.length/pageSize);
  if(!group.length){target.textContent='No semester is configured for this year yet.';return;}
  if(!units.length){target.textContent='No units are listed for Year '+selectedAcademicYear+' · Semester '+selectedAcademicSemester+' yet.';return;}
  if(selectedAcademicPage>=pageCount)selectedAcademicPage=Math.max(0,pageCount-1);
  target.append(el('h3','','Year '+selectedAcademicYear+' · Semester '+selectedAcademicSemester+' · '+units.length+' units'));
  for(const unit of units.slice(selectedAcademicPage*pageSize,(selectedAcademicPage+1)*pageSize)){const row=el('div','admin-list-row');row.append(el('span','',unit.code+' · '+unit.name));const edit=el('button','btn btn-sm btn-outline-success rounded-pill','Edit');edit.type='button';edit.addEventListener('click',()=>editUnit(unit));row.append(edit);target.append(row);}
  if(pageCount>1){const pager=el('div','catalogue-pager');const previous=el('button','pager-button','← Previous');previous.type='button';previous.disabled=selectedAcademicPage===0;previous.addEventListener('click',()=>{selectedAcademicPage--;renderAcademics();});const label=el('span','pager-label','Page '+(selectedAcademicPage+1)+' of '+pageCount);const next=el('button','pager-button','Next →');next.type='button';next.disabled=selectedAcademicPage>=pageCount-1;next.addEventListener('click',()=>{selectedAcademicPage++;renderAcademics();});pager.append(previous,label,next);target.append(pager);}
}
function editUnit(unit){
  editingUnitId=unit.unitId;const form=document.getElementById('unit-form');
  form.elements.semesterId.value=unit.semesterId;form.elements.code.value=unit.code;form.elements.name.value=unit.name;form.elements.description.value=unit.description||'';
  document.getElementById('unit-form-title').textContent='Edit '+unit.code;form.querySelector('button[type=submit]').textContent='Save unit changes';form.scrollIntoView({behavior:'smooth'});
}
async function loadTimetable(){const data=await api('/api/admin/timetable');timetableEntries=data.entries;renderTimetable();}
function renderTimetable(){
  const target=document.getElementById('admin-timetable');target.replaceChildren();
  const years=[...new Set(timetableEntries.map(x=>Number(x.year)))].sort((a,b)=>a-b);
  if(!years.length){target.textContent='No timetable entries are configured.';return;}
  if(!years.includes(selectedTimetableYear))selectedTimetableYear=years.includes(3)?3:years[0];
  const semesters=[...new Set(timetableEntries.filter(x=>Number(x.year)===selectedTimetableYear).map(x=>Number(x.semester)))].sort((a,b)=>a-b);
  if(!semesters.includes(selectedTimetableSemester))selectedTimetableSemester=semesters.includes(1)?1:semesters[0];
  const scope=timetableEntries.filter(x=>Number(x.year)===selectedTimetableYear&&Number(x.semester)===selectedTimetableSemester);
  const days=[...new Set(scope.map(x=>x.day))].sort((a,b)=>['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(a)-['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(b));
  if(!days.includes(selectedTimetableDay))selectedTimetableDay=days[0];
  const yearsNode=document.getElementById('admin-schedule-years'),semNode=document.getElementById('admin-schedule-semesters'),daysNode=document.getElementById('admin-schedule-days');yearsNode.replaceChildren();semNode.replaceChildren();daysNode.replaceChildren();
  for(const year of years){const button=el('button','filter-button'+(year===selectedTimetableYear?' active':''),'Year '+year);button.type='button';button.addEventListener('click',()=>{selectedTimetableYear=year;selectedTimetableSemester=null;selectedTimetableDay=null;renderTimetable();});yearsNode.append(button);}
  for(const semester of semesters){const button=el('button','filter-button'+(semester===selectedTimetableSemester?' active':''),'Semester '+semester);button.type='button';button.addEventListener('click',()=>{selectedTimetableSemester=semester;selectedTimetableDay=null;renderTimetable();});semNode.append(button);}
  for(const day of days){const button=el('button','filter-button'+(day===selectedTimetableDay?' active':''),day);button.type='button';button.addEventListener('click',()=>{selectedTimetableDay=day;renderTimetable();});daysNode.append(button);}
  const selected=scope.filter(x=>x.day===selectedTimetableDay);
  if(!selected.length){target.textContent='No classes are scheduled for this day.';return;}
  target.append(el('h3','','Year '+selectedTimetableYear+' · Semester '+selectedTimetableSemester+' · '+selectedTimetableDay));
  for(const entry of selected){
    const row=el('article','schedule-class-card timetable-admin-card');const time=el('div','schedule-class-time',entry.startsAt+' – '+entry.endsAt);const info=el('div','schedule-class-details');info.append(el('span','schedule-unit-code',entry.code),el('h3','',entry.name),el('p','',(entry.lecturer||'Lecturer unspecified')+' · '+(entry.venue||'Venue unspecified')+(entry.classType?' · '+entry.classType:'')));
    const actions=el('div','d-flex gap-2 timetable-admin-actions');const edit=el('button','btn btn-sm btn-outline-success rounded-pill','Edit');edit.type='button';edit.addEventListener('click',()=>editTimetable(entry));const remove=el('button','btn btn-sm btn-outline-danger rounded-pill','Remove');remove.type='button';remove.addEventListener('click',async()=>{if(!confirm('Remove this timetable entry?'))return;try{await api('/api/admin/timetable/'+entry.id,{method:'DELETE',body:'{}'});await loadTimetable();message('Timetable entry removed.');}catch(error){message(error.message,true);}});actions.append(edit,remove);row.append(time,info,actions);target.append(row);
  }
}
function editTimetable(entry){
  editingTimetableId=entry.id;const form=document.getElementById('timetable-form');
  for(const key of ['day','unitId','startsAt','endsAt','lecturer','venue','classType'])form.elements[key].value=entry[key]??'';
  document.getElementById('timetable-form-title').textContent='Edit timetable entry';document.getElementById('cancel-timetable-edit').classList.remove('d-none');form.scrollIntoView({behavior:'smooth'});
}
function resetTimetableForm(){editingTimetableId=null;const form=document.getElementById('timetable-form');form.reset();document.getElementById('timetable-form-title').textContent='Add class';document.getElementById('cancel-timetable-edit').classList.add('d-none');}
async function loadAnnouncements(){const data=await api('/api/admin/announcements');announcementDrafts=data.announcements;renderAnnouncements();}
function renderAnnouncements(){
  const target=document.getElementById('announcement-list');target.replaceChildren();
  if(!announcementDrafts.length){target.textContent='No announcements or drafts have been created.';return;}
  for(const item of announcementDrafts){
    const card=el('article','admin-list-card');card.append(el('div','admin-list-meta',item.category+' · '+item.audience+' · '+item.status+' · '+item.priority),el('h3','',item.title),el('p','',item.body));
    const actions=el('div','d-flex gap-2 flex-wrap');
    if(item.status==='draft'){
      const edit=el('button','btn btn-sm btn-outline-success rounded-pill','Edit draft');edit.type='button';edit.addEventListener('click',()=>editAnnouncement(item));actions.append(edit);
      const publish=el('button','btn btn-sm btn-success rounded-pill','Review & publish');publish.type='button';publish.addEventListener('click',async()=>{if(!confirm('Publish this announcement to '+item.audience+'? Student notices will be created; no email will be sent.'))return;try{await api('/api/admin/announcements/'+item.id+'/publish',{method:'POST',body:'{}'});await loadAnnouncements();await loadOverview();message('Announcement published.');}catch(error){message(error.message,true);}});actions.append(publish);
    }else if(item.status==='published'){
      const archive=el('button','btn btn-sm btn-outline-secondary rounded-pill','Archive');archive.type='button';archive.addEventListener('click',async()=>{if(!confirm('Archive this published announcement?'))return;try{await api('/api/admin/announcements/'+item.id+'/archive',{method:'POST',body:'{}'});await loadAnnouncements();await loadOverview();}catch(error){message(error.message,true);}});actions.append(archive);
    }
    card.append(actions);target.append(card);
  }
}
function editAnnouncement(item){
  editingAnnouncementId=item.id;const form=document.getElementById('announcement-form');
  for(const key of ['title','body','category','audience','priority'])form.elements[key].value=item[key];
  document.getElementById('announcement-form-title').textContent='Edit draft';form.querySelector('button[type=submit]').textContent='Save draft changes';form.scrollIntoView({behavior:'smooth'});
}
async function loadEvents(){
  const data=await api('/api/admin/events');const target=document.getElementById('event-list');target.replaceChildren();
  if(!data.events.length){target.textContent='No events have been created.';return;}
  for(const event of data.events){const row=el('div','admin-list-row');row.append(el('span','',event.eventType.toUpperCase()+' · '+event.title+' · '+new Date(event.startsAt).toLocaleString('en-GB',{timeZone:'Africa/Nairobi'})+' · '+(event.venue||'Venue unspecified')+' · '+event.status));if(event.status==='draft'){const publish=el('button','btn btn-sm btn-success rounded-pill','Publish');publish.type='button';publish.addEventListener('click',async()=>{if(!confirm('Publish this event?'))return;try{await api('/api/admin/events/'+event.id+'/publish',{method:'POST',body:'{}'});await loadEvents();await loadOverview();message('Event published.');}catch(error){message(error.message,true);}});row.append(publish);}target.append(row);}
}
async function loadStudents(){
  const search=document.getElementById('student-search').value.trim();const data=await api('/api/admin/students?search='+encodeURIComponent(search));students=data.students;renderStudents();
}
function isPendingApproval(student){return !student.emailVerifiedAt&&!student.adminApprovedAt&&student.status!=='suspended';}
function renderStudentFilters(){const target=document.getElementById('student-filter-buttons');target.replaceChildren();const pending=students.filter(isPendingApproval).length;const options=[['pending','Awaiting approval',pending],['all','All students',students.length],['active','Active',students.filter(x=>x.status==='active').length],['suspended','Suspended',students.filter(x=>x.status==='suspended').length]];document.getElementById('student-pending-hint').textContent=pending?pending+' account'+(pending===1?'':'s')+' need'+(pending===1?'s':'')+' your approval.':'No student approvals are waiting.';for(const [value,label,count] of options){const button=el('button','filter-button'+(studentFilter===value?' active':''),label+' · '+count);button.type='button';button.setAttribute('aria-pressed',String(studentFilter===value));button.addEventListener('click',()=>{studentFilter=value;renderStudents();});target.append(button);}}
function renderStudents(){
  renderStudentFilters();const target=document.getElementById('student-list');target.replaceChildren();
  const filtered=students.filter(student=>studentFilter==='pending'?isPendingApproval(student):studentFilter==='active'?student.status==='active':studentFilter==='suspended'?student.status==='suspended':true);
  if(!filtered.length){target.textContent=studentFilter==='pending'?'No student accounts are waiting for approval. New registrations will appear here.':'No student accounts match this filter or search.';return;}
  for(const student of filtered){
    const row=el('article','admin-list-row student-admin-row'+(isPendingApproval(student)?' needs-approval':''));const info=el('div','student-admin-info');
    const state=isPendingApproval(student)?'Awaiting your approval':student.emailVerifiedAt?'Email verified · '+student.status:student.adminApprovedAt?'Admin approved · '+student.status:student.status;
    info.append(el('strong','',student.fullName),el('span','',student.admissionNumber+' · '+student.email),el('small','student-approval-state',state));row.append(info);
    const actions=el('div','student-admin-controls');
    if(isPendingApproval(student)){const approve=el('button','btn btn-sm btn-success rounded-pill approval-action','Approve & activate');approve.type='button';approve.addEventListener('click',async()=>{approve.disabled=true;try{await api('/api/admin/students/'+student.id,{method:'PATCH',body:JSON.stringify({status:'active',directoryPublic:false,publicDisplayName:null})});message(student.fullName+' can now sign in.');await loadStudents();}catch(error){approve.disabled=false;message(error.message,true);}});actions.append(approve);}
    const status=document.createElement('select');status.className='form-select form-select-sm';status.setAttribute('aria-label','Student account status');status.append(new Option('Active','active'),new Option('Suspended','suspended'));status.value=student.status==='suspended'?'suspended':'active';
    const directory=document.createElement('input');directory.type='checkbox';directory.checked=Boolean(student.directoryPublic);directory.setAttribute('aria-label','Show in public directory');
    const display=document.createElement('input');display.className='form-control form-control-sm';display.placeholder='Approved public name';display.value=student.publicDisplayName||'';display.setAttribute('aria-label','Public directory display name');display.disabled=!directory.checked;directory.addEventListener('change',()=>{display.disabled=!directory.checked;});
    const save=el('button','btn btn-sm btn-outline-success rounded-pill','Save settings');save.type='button';save.addEventListener('click',async()=>{try{await api('/api/admin/students/'+student.id,{method:'PATCH',body:JSON.stringify({status:status.value,directoryPublic:directory.checked,publicDisplayName:display.value})});message('Student settings saved.');await loadStudents();}catch(error){message(error.message,true);}});
    actions.append(status,directory,display,save);row.append(actions);target.append(row);
  }
}
document.getElementById('show-pending-students').addEventListener('click',()=>{studentFilter='pending';renderStudents();document.getElementById('students').scrollIntoView({behavior:'smooth'});});
document.querySelector('.approval-quick-link').addEventListener('click',()=>{studentFilter='pending';renderStudents();});
function renderRecipients(){
  const target=document.getElementById('recipient-list');target.replaceChildren();
  const query=document.getElementById('email-search').value.toLowerCase();
  const filter=document.getElementById('email-filter').value;
  const category=document.querySelector('#email-form [name=category]').value;
  const filtered=recipients.filter((person)=>{
    const eligible=Boolean(person.emailVerifiedAt||person.adminApprovedAt)&&(category==='essential'||(person.nonessentialEmailConsentAt&&!person.emailUnsubscribedAt));
    if(filter==='consented'&&!person.nonessentialEmailConsentAt)return false;
    if(filter==='unverified'&&(person.emailVerifiedAt||person.adminApprovedAt))return false;
    if(filter==='all'&&!(person.emailVerifiedAt||person.adminApprovedAt))return false;
    if(category==='nonessential'&&!eligible&&filter!=='unverified')return false;
    return (person.fullName+' '+person.admissionNumber+' '+person.email).toLowerCase().includes(query);
  });
  if(!filtered.length){target.textContent='No recipients match this filter.';updateSelectedCount();return;}
  for(const person of filtered){
    const label=document.createElement('label');label.className='recipient-row';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selectedRecipients.has(Number(person.id));checkbox.disabled=!(person.emailVerifiedAt||person.adminApprovedAt)||(category==='nonessential'&&(!person.nonessentialEmailConsentAt||person.emailUnsubscribedAt));
    checkbox.addEventListener('change',()=>{if(checkbox.checked)selectedRecipients.add(Number(person.id));else selectedRecipients.delete(Number(person.id));updateSelectedCount();});
    const details=el('span','recipient-details');details.append(el('strong','',person.fullName),el('small','',person.admissionNumber+' · '+person.email));label.append(checkbox,details);
    if(!(person.emailVerifiedAt||person.adminApprovedAt))label.append(el('span','recipient-state','Awaiting approval'));else if(!person.emailVerifiedAt)label.append(el('span','recipient-state','Admin approved'));else if(person.emailUnsubscribedAt)label.append(el('span','recipient-state','Unsubscribed'));else if(!person.nonessentialEmailConsentAt)label.append(el('span','recipient-state','Essential only'));
    target.append(label);
  }
  updateSelectedCount();
}
function updateSelectedCount(){document.getElementById('selected-count').textContent=selectedRecipients.size+' selected';}
async function loadEmail(){
  const [recipientData,historyData]=await Promise.all([api('/api/admin/email/recipients'),api('/api/admin/email/history')]);
  recipients=recipientData.recipients;renderRecipients();renderEmailHistory(historyData.campaigns);
  const status=await api('/api/auth/status');document.getElementById('smtp-status').textContent=status.emailVerificationAvailable?'Configured':'Manual Gmail mode · SMTP not configured';document.getElementById('email-test').disabled=!status.emailVerificationAvailable;document.querySelector('#email-form button[type=submit]').disabled=!status.emailVerificationAvailable;const settings=await api('/api/admin/site-settings');const bgForm=document.getElementById('site-background-form');bgForm.elements.overlayColor.value=settings.settings.background_tint||'#071a17';if(settings.settings.hasBackground)document.getElementById('background-preview').textContent='A custom background is currently set.';const aiButton=document.querySelector('#ai-form button[type=submit]');aiButton.disabled=!status.adminAiAvailable;document.getElementById('ai-config-state').textContent=status.adminAiAvailable?'AI drafting is configured. Drafts require review before use.':'AI drafting is not configured. Set OPENAI_API_KEY and OPENAI_MODEL on the server.';
}
function renderEmailHistory(campaigns){
  const target=document.getElementById('email-history');target.replaceChildren();target.append(el('h3','','Recent email activity'));
  if(!campaigns.length){target.append(el('p','','No email campaigns have been sent.'));return;}
  for(const campaign of campaigns)target.append(el('div','admin-list-row',campaign.subject+' · '+campaign.category+' · '+campaign.recipientCount+' recipients · '+(campaign.acceptedCount||0)+' accepted by provider · '+(campaign.failedCount||0)+' failed · '+new Date(campaign.createdAt).toLocaleString()));
}
async function loadResourcesGallery(){
  const [resources,gallery]=await Promise.all([api('/api/admin/resources'),api('/api/admin/gallery')]);
  const r=document.getElementById('resource-list');r.replaceChildren();
  if(!resources.resources.length)r.textContent='No learning resources have been uploaded.';
  else for(const item of resources.resources){const row=el('div','admin-list-row');row.append(el('span','',item.code+' · '+item.title+' · '+item.resourceType+' · '+item.filename));const link=el('a','btn btn-sm btn-outline-success rounded-pill','Download');link.href='/api/admin/resources/'+item.id+'/download';row.append(link);if(item.approvalStatus==='pending'){const approve=el('button','btn btn-sm btn-success rounded-pill','Approve');approve.type='button';approve.addEventListener('click',async()=>{try{await api('/api/admin/resources/'+item.id,{method:'PATCH',body:JSON.stringify({approvalStatus:'approved'})});await loadResourcesGallery();message('Resource approved and shared with the class.');}catch(e){message(e.message,true);}});row.append(approve);}row.append(el('span','resource-state',item.approvalStatus));r.append(row);}
  const g=document.getElementById('gallery-list');g.replaceChildren();
  if(!gallery.items.length)g.textContent='No gallery items have been uploaded.';
  else for(const item of gallery.items){const row=el('div','admin-list-row');row.append(el('span','',item.title+' · '+item.status+' · '+(item.permissionConfirmed?'Permission confirmed':'Permission not confirmed')));if(item.status!=='published'&&item.permissionConfirmed){const b=el('button','btn btn-sm btn-success rounded-pill','Publish');b.type='button';b.addEventListener('click',async()=>{try{await api('/api/admin/gallery/'+item.id,{method:'PATCH',body:JSON.stringify({status:'published'})});await loadResourcesGallery();message('Photo published.');}catch(e){message(e.message,true);}});row.append(b);}g.append(row);}
}
async function loadContacts(){const data=await api('/api/admin/contacts?status='+encodeURIComponent(document.getElementById('contact-filter').value));const target=document.getElementById('contact-list');target.replaceChildren();if(!data.messages.length){target.textContent='No messages in this status.';return;}for(const item of data.messages){const card=el('article','admin-list-card');card.append(el('div','admin-list-meta',item.name+' · '+item.email+' · '+new Date(item.createdAt).toLocaleString()),el('h3','',item.subject),el('p','',item.message));const select=document.createElement('select');select.className='form-select filter-field';for(const [label,value] of [['New','new'],['Reviewed','reviewed'],['Closed','closed']])select.add(new Option(label,value));select.value=item.status;select.addEventListener('change',async()=>{try{await api('/api/admin/contacts/'+item.id,{method:'PATCH',body:JSON.stringify({status:select.value})});await loadContacts();}catch(e){message(e.message,true);}});card.append(select);target.append(card);}}
async function loadTimetableAndAcademics(){await loadAcademics();await loadTimetable();}
async function initialize(){
  await startSecureSession();const me=await api('/api/auth/me');document.getElementById('dash-user').textContent=me.fullName;
  const results=await Promise.allSettled([loadOverview(),loadTimetableAndAcademics(),loadAnnouncements(),loadEvents(),loadStudents(),loadEmail(),loadResourcesGallery(),loadContacts()]);
  for(const result of results)if(result.status==='rejected')message(result.reason.message,true);
}
document.getElementById('logout-button').addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});location.assign('/admin-login.html');}catch(error){message(error.message,true);}});
document.querySelectorAll('.dash-nav[href^="#"]').forEach((link)=>link.addEventListener('click',()=>{document.querySelectorAll('.dash-nav').forEach((item)=>item.classList.remove('active'));link.classList.add('active');}));
document.getElementById('student-search').addEventListener('input',()=>{clearTimeout(window.studentSearchTimer);window.studentSearchTimer=setTimeout(()=>loadStudents().catch((e)=>message(e.message,true)),250);});
document.getElementById('email-search').addEventListener('input',renderRecipients);document.getElementById('email-filter').addEventListener('change',renderRecipients);document.querySelector('#email-form [name=category]').addEventListener('change',renderRecipients);
document.getElementById('select-all').addEventListener('click',()=>{const category=document.querySelector('#email-form [name=category]').value;for(const p of recipients)if((p.emailVerifiedAt||p.adminApprovedAt)&&(category==='essential'||(p.nonessentialEmailConsentAt&&!p.emailUnsubscribedAt)))selectedRecipients.add(Number(p.id));renderRecipients();});
document.getElementById('deselect-all').addEventListener('click',()=>{selectedRecipients.clear();renderRecipients();});
document.getElementById('year-form').addEventListener('submit',async(event)=>{event.preventDefault();try{await api('/api/admin/academic-years',{method:'POST',body:JSON.stringify({yearNumber:Number(event.currentTarget.elements.yearNumber.value)})});event.currentTarget.reset();await loadAcademics();message('Academic year added.');}catch(error){message(error.message,true);}});
document.getElementById('semester-form').addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;try{await api('/api/admin/academic-years/'+f.elements.yearId.value+'/semesters',{method:'POST',body:JSON.stringify({semesterNumber:Number(f.elements.semesterNumber.value)})});await loadAcademics();message('Semester added.');}catch(error){message(error.message,true);}});
document.getElementById('unit-form').addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;const body=JSON.stringify({semesterId:Number(f.elements.semesterId.value),code:f.elements.code.value,name:f.elements.name.value,description:f.elements.description.value});try{if(editingUnitId)await api('/api/admin/units/'+editingUnitId,{method:'PUT',body});else await api('/api/admin/units',{method:'POST',body});editingUnitId=null;f.reset();document.getElementById('unit-form-title').textContent='Add unit';f.querySelector('button[type=submit]').textContent='Add unit';await loadAcademics();message('Unit saved.');}catch(error){message(error.message,true);}});
document.getElementById('timetable-form').addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;const body=JSON.stringify({day:f.elements.day.value,unitId:Number(f.elements.unitId.value),startsAt:f.elements.startsAt.value,endsAt:f.elements.endsAt.value,lecturer:f.elements.lecturer.value,venue:f.elements.venue.value,classType:f.elements.classType.value});try{await api(editingTimetableId?'/api/admin/timetable/'+editingTimetableId:'/api/admin/timetable',{method:editingTimetableId?'PUT':'POST',body});resetTimetableForm();await loadTimetable();message('Timetable saved.');}catch(error){message(error.message,true);}});
document.getElementById('cancel-timetable-edit').addEventListener('click',resetTimetableForm);
document.getElementById('announcement-form').addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;const body=JSON.stringify({title:f.elements.title.value,body:f.elements.body.value,category:f.elements.category.value,audience:f.elements.audience.value,priority:f.elements.priority.value});try{if(editingAnnouncementId)await api('/api/admin/announcements/'+editingAnnouncementId,{method:'PUT',body});else await api('/api/admin/announcements',{method:'POST',body});editingAnnouncementId=null;f.reset();document.getElementById('announcement-form-title').textContent='Create a draft';f.querySelector('button[type=submit]').textContent='Save draft';await loadAnnouncements();message('Draft saved.');}catch(error){message(error.message,true);}});
document.getElementById('event-form').addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;const publish=event.submitter?.value==='publish';const parseLocalTime=(value,label)=>{if(!value)throw new Error('Choose a '+label+'.');const date=new Date(value);if(Number.isNaN(date.getTime()))throw new Error('Choose a valid '+label+'.');return date.toISOString();};let startsAt,endsAt=null;try{startsAt=parseLocalTime(f.elements.startsAt.value,'start time');if(f.elements.endsAt.value)endsAt=parseLocalTime(f.elements.endsAt.value,'end time');}catch(error){message(error.message,true);return;}let created;try{created=await api('/api/admin/events',{method:'POST',body:JSON.stringify({title:f.elements.title.value,eventType:f.elements.eventType.value,description:f.elements.description.value,startsAt,endsAt,venue:f.elements.venue.value})});}catch(error){message(error.message,true);return;}if(publish){try{await api('/api/admin/events/'+created.id+'/publish',{method:'POST',body:JSON.stringify({})});}catch(error){f.reset();await loadEvents().catch(()=>{});message('The draft was saved, but publishing failed: '+error.message,true);return;}}f.reset();try{await loadEvents();}catch(error){message((publish?'Event published':'Draft saved')+', but the event list could not refresh: '+error.message,true);return;}message(publish?'Event published and student notices created.':'Event saved as a draft. Use Publish when ready.');});
document.getElementById('email-preview').addEventListener('click',()=>{const f=document.getElementById('email-form');document.getElementById('preview-subject').textContent=f.elements.subject.value;document.getElementById('preview-body').textContent=f.elements.body.value;bootstrap.Modal.getOrCreateInstance(document.getElementById('email-preview-modal')).show();});
document.getElementById('email-test').addEventListener('click',async()=>{const f=document.getElementById('email-form');try{const result=await api('/api/admin/email/test',{method:'POST',body:JSON.stringify({subject:f.elements.subject.value,body:f.elements.body.value})});document.getElementById('email-results').textContent=result.message;}catch(error){document.getElementById('email-results').textContent=error.message;}});
document.getElementById('email-form').addEventListener('submit',async(event)=>{event.preventDefault();const f=event.currentTarget;const count=selectedRecipients.size;if(!count)return document.getElementById('email-results').textContent='Select at least one eligible recipient.';if(!confirm('Send this email individually to '+count+' selected students?'))return;const body={subject:f.elements.subject.value,body:f.elements.body.value,category:f.elements.category.value,recipientIds:[...selectedRecipients],confirm:true,idempotencyKey:crypto.randomUUID()};const status=document.getElementById('email-results');status.textContent='Sending individual messages…';try{const result=await api('/api/admin/email/send',{method:'POST',body:JSON.stringify(body)});const sent=result.results.filter((x)=>x.status==='sent').length;const failed=result.results.length-sent;status.textContent='Provider accepted '+sent+' message(s); '+failed+' failed. Accepted does not mean delivered.';await loadEmail();}catch(error){status.textContent=error.message;}});
document.getElementById('ai-form').addEventListener('submit',async(event)=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button[type=submit]');button.disabled=true;document.getElementById('ai-config-state').textContent='Generating draft…';try{const result=await api('/api/admin/ai/announcement-draft',{method:'POST',body:JSON.stringify({prompt:form.elements.prompt.value})});const announcement=document.getElementById('announcement-form');announcement.elements.title.value=result.title;announcement.elements.body.value=result.body;announcement.elements.category.value='general';announcement.elements.audience.value='students';announcement.elements.priority.value='normal';document.getElementById('ai-config-state').textContent='Draft generated and copied into the announcement editor. Review it, then save manually.';announcement.scrollIntoView({behavior:'smooth'});}catch(error){document.getElementById('ai-config-state').textContent=error.message;}finally{button.disabled=false;}});
document.querySelector('.dash-menu-toggle').addEventListener('click',event=>{const sidebar=document.querySelector('.dash-sidebar');const open=sidebar.classList.toggle('nav-open');event.currentTarget.setAttribute('aria-expanded',String(open));});
document.getElementById('site-background-form').addEventListener('submit',async event=>{event.preventDefault();const f=event.currentTarget;const data=new FormData();if(f.elements.backgroundFile.files[0])data.append('backgroundFile',f.elements.backgroundFile.files[0]);data.append('overlayColor',f.elements.overlayColor.value);try{const result=await uploadApi('/api/admin/site-settings/background',data);document.getElementById('site-background-message').textContent=result.message;applySiteBackground({background_image_url:result.imageUrl+'?v='+Date.now(),background_tint:f.elements.overlayColor.value});}catch(e){document.getElementById('site-background-message').textContent=e.message;}});
document.getElementById('background-remove').addEventListener('click',async()=>{try{const result=await api('/api/admin/site-settings/background',{method:'DELETE',body:'{}'});document.getElementById('site-background-message').textContent=result.message;document.getElementById('background-preview').textContent='';document.documentElement.style.removeProperty('--site-bg-image');}catch(e){document.getElementById('site-background-message').textContent=e.message;}});
function applySiteBackground(settings){if(settings.background_image_url)document.documentElement.style.setProperty('--site-bg-image','url("'+settings.background_image_url.replace(/["'()\\]/g,'')+'")');document.documentElement.style.setProperty('--site-bg-tint',settings.background_tint||'#071a17');}
document.getElementById('contact-filter').addEventListener('change',()=>loadContacts().catch(e=>message(e.message,true)));
document.getElementById('resource-form').addEventListener('submit',async(event)=>{event.preventDefault();try{const data=new FormData(event.currentTarget);const result=await uploadApi('/api/admin/resources',data);event.currentTarget.reset();await loadResourcesGallery();message(result.message);}catch(e){message(e.message,true);}});
document.getElementById('gallery-form').addEventListener('submit',async(event)=>{event.preventDefault();try{const result=await uploadApi('/api/admin/gallery',new FormData(event.currentTarget));event.currentTarget.reset();await loadResourcesGallery();message(result.message);}catch(e){message(e.message,true);}});
initialize().catch((error)=>message(error.message,true));

document.getElementById('email-gmail').addEventListener('click',async()=>{const form=document.getElementById('email-form'),category=form.elements.category.value;const chosen=recipients.filter(p=>selectedRecipients.has(Number(p.id))&&(p.emailVerifiedAt||p.adminApprovedAt)&&(category==='essential'||(p.nonessentialEmailConsentAt&&!p.emailUnsubscribedAt)));if(!chosen.length){document.getElementById('email-results').textContent='Select eligible recipients first.';return;}const bcc=chosen.map(x=>x.email).join(',');const params=new URLSearchParams({view:'cm',fs:'1',su:form.elements.subject.value,body:form.elements.body.value});if(bcc.length<1500)params.set('bcc',bcc);const tab=window.open('https://mail.google.com/mail/?'+params.toString(),'_blank');const status=document.getElementById('email-results');if(!tab){status.textContent='Allow pop-ups for this local site, then try Gmail again.';return;}try{tab.opener=null;}catch{}if(bcc.length>=1500){try{await navigator.clipboard.writeText(bcc);status.textContent=chosen.length+' addresses copied. Gmail draft opened; paste them into BCC.';}catch{status.textContent='Gmail draft opened. Copy eligible BCC addresses from the recipient list.';}}else status.textContent='Gmail draft opened with '+chosen.length+' recipients in BCC. Review it and send manually.';});
