async function draftAnnouncement(prompt) {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) { const error=new Error('AI is not configured. Set OPENAI_API_KEY and OPENAI_MODEL on the server.'); error.code='AI_NOT_CONFIGURED'; throw error; }
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL,input:[{role:'system',content:'Create announcement drafts for a university class portal. Do not invent dates, places, names or facts. Return only a JSON object with title, body, funnyVersion, professionalVersion, whatsappVersion. Mark missing facts as placeholders.'},{role:'user',content:prompt}],text:{format:{type:'json_object'}},store:false})});
  const data=await response.json().catch(()=>({})); if(!response.ok) { const e=new Error('The AI provider could not complete this draft.');e.code='AI_PROVIDER_ERROR';throw e; }
  const output=(data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text; if(!output)throw new Error('The AI provider returned no draft.');
  let parsed;try{parsed=JSON.parse(output)}catch{throw new Error('The AI provider returned an invalid draft.');}
  for(const key of ['title','body','funnyVersion','professionalVersion','whatsappVersion'])if(typeof parsed[key]!=='string')parsed[key]='';
  return {draft:parsed,model:process.env.OPENAI_MODEL};
}
async function answerStudent(question) {
 if(!process.env.OPENAI_API_KEY||!process.env.OPENAI_MODEL){const error=new Error('The academic assistant is not configured.');error.code='AI_NOT_CONFIGURED';throw error;}
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL,input:[{role:'system',content:'You are a study assistant for university students. Explain concepts, support revision and practice. Do not claim answers are official university guidance or invent course-specific facts. Ask for missing context when needed. Keep answers clear.'},{role:'user',content:question}],store:false})});
 const data=await response.json().catch(()=>({}));if(!response.ok){const e=new Error('The AI provider could not answer right now.');e.code='AI_PROVIDER_ERROR';throw e;}const answer=(data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;if(!answer)throw new Error('The AI provider returned no answer.');return answer;
}
module.exports={draftAnnouncement,answerStudent};
