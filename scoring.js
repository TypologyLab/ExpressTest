(function(root){
 function fail(error){return {ok:false,error};}
 function calculateResult(answers,spec){
  try{
   if(!answers||typeof answers!=="object"||Array.isArray(answers))return fail("INVALID_INPUT");
   if(!spec||typeof spec!=="object"||!Array.isArray(spec.questions)||!spec.dimensions||!spec.answerOptions||!spec.rules||!Array.isArray(spec.dimensionPriority)||typeof spec.version!=="string")return fail("INVALID_TEST_SPEC");
   const dims=spec.dimensionPriority, questions=spec.questions, ids=new Set(), counts=Object.fromEntries(dims.map(d=>[d,0]));
   if(dims.join(",")!=="EI,SN,TF,JP"||questions.length!==24)return fail("INVALID_TEST_SPEC");
   for(const d of dims){const x=spec.dimensions[d];if(!x||x.positive!==({EI:"E",SN:"S",TF:"T",JP:"J"})[d]||x.negative!==({EI:"I",SN:"N",TF:"F",JP:"P"})[d])return fail("INVALID_TEST_SPEC");}
   const optionKeys={a2:["A",2],a1:["A",1],neutral:["N",0],b1:["B",1],b2:["B",2],skip:["skip",null]};
   if(Object.keys(spec.answerOptions).length!==Object.keys(optionKeys).length||Object.entries(optionKeys).some(([k,v])=>!spec.answerOptions[k]||spec.answerOptions[k].side!==v[0]||spec.answerOptions[k].degree!==v[1]))return fail("INVALID_TEST_SPEC");
   const rr=spec.rules;
   if(!rr.axis||rr.axis.positiveMin!==3||rr.axis.negativeMax!==-3||rr.axis.unresolvedMin!==-2||rr.axis.unresolvedMax!==2||!rr.contextConflict||rr.contextConflict.half1PositiveMin!==2||rr.contextConflict.half1NegativeMax!==-2||rr.contextConflict.half2PositiveMin!==2||rr.contextConflict.half2NegativeMax!==-2||!rr.clarity||rr.clarity.lowResolvedMax!==2||rr.clarity.mediumResolvedCount!==3||rr.clarity.lowConflictMin!==2)return fail("RULES_NOT_APPROVED");
   for(const q of questions){if(!q||typeof q.id!=="string"||ids.has(q.id)||!dims.includes(q.dimension)||!Number.isInteger(q.sequence)||!([1,2,3,4,5,6].includes(q.sequence))||q.half!==(q.sequence<=3?1:2)||![spec.dimensions[q.dimension].positive,spec.dimensions[q.dimension].negative].includes(q.poleA)||q.weight!==1||typeof q.prompt!=="string"||typeof q.a!=="string"||typeof q.b!=="string")return fail("INVALID_TEST_SPEC");ids.add(q.id);counts[q.dimension]++;}
   if(dims.some(d=>counts[d]!==6))return fail("INVALID_TEST_SPEC");
   if(Object.keys(answers).some(id=>!ids.has(id)))return fail("UNKNOWN_QUESTION");
   for(const [id,key] of Object.entries(answers))if(!Object.prototype.hasOwnProperty.call(spec.answerOptions,key))return fail("INVALID_ANSWER");
   const totals=Object.fromEntries(dims.map(d=>[d,{score:0,h1:0,h2:0,answered:0,skipped:0}]));
   for(const q of questions){if(!Object.prototype.hasOwnProperty.call(answers,q.id))continue;const key=answers[q.id],o=spec.answerOptions[key],acc=totals[q.dimension];if(key==="skip"){acc.skipped++;continue;}const raw=o.side==="A"?o.degree:o.side==="B"?-o.degree:0;const sign=q.poleA===spec.dimensions[q.dimension].positive?1:-1;const contribution=q.weight*raw*sign;acc.score+=contribution;acc["h"+q.half]+=contribution;acc.answered++;}
   const dimensions={};
   for(const d of dims){const x=totals[d],complete=x.answered===6, direction=!complete?null:x.score>=rr.axis.positiveMin?spec.dimensions[d].positive:x.score<=rr.axis.negativeMax?spec.dimensions[d].negative:null;const conflict=complete&&((x.h1>=rr.contextConflict.half1PositiveMin&&x.h2<=rr.contextConflict.half2NegativeMax)||(x.h1<=rr.contextConflict.half1NegativeMax&&x.h2>=rr.contextConflict.half2PositiveMin));dimensions[d]={score:x.score,h1:x.h1,h2:x.h2,answered:x.answered,skipped:x.skipped,complete,direction,status:!complete?"unscored":direction?"directed":"unresolved",contextConflict:complete?conflict:null};}
   const missingQuestions=questions.filter(q=>!Object.prototype.hasOwnProperty.call(answers,q.id)).map(q=>q.id),skippedQuestions=questions.filter(q=>answers[q.id]==="skip").map(q=>q.id),unscored=dims.filter(d=>!dimensions[d].complete),unresolved=dims.filter(d=>dimensions[d].complete&&!dimensions[d].direction),conflicts=dims.filter(d=>dimensions[d].contextConflict===true),resolved=dims.filter(d=>dimensions[d].direction),allComplete=unscored.length===0;
   const pattern=dims.map(d=>!dimensions[d].complete?"?":dimensions[d].direction||"X").join("");
   let primaryHypothesis=null,alternativeHypotheses=[],hypothesisStatus;
   if(!allComplete)hypothesisStatus="incomplete";
   else if(unresolved.length===0){hypothesisStatus="complete";primaryHypothesis=dims.map(d=>dimensions[d].direction).join("");const min=Math.min(...dims.map(d=>Math.abs(dimensions[d].score)));for(const d of dims.filter(d=>Math.abs(dimensions[d].score)===min)){const chars=primaryHypothesis.split(""),i=dims.indexOf(d),x=spec.dimensions[d];chars[i]=chars[i]===x.positive?x.negative:x.positive;alternativeHypotheses.push(chars.join(""));}}
   else if(unresolved.length===1){hypothesisStatus="one_unresolved";const d=unresolved[0],x=spec.dimensions[d];for(const p of [x.negative,x.positive])alternativeHypotheses.push(dims.map(k=>k===d?p:dimensions[k].direction).join(""));}
   else if(unresolved.length===2){hypothesisStatus="two_unresolved";const combinations=[];for(let mask=0;mask<4;mask++){let bit=0;combinations.push(dims.map(d=>{if(dimensions[d].direction)return dimensions[d].direction;const pole=spec.dimensions[d][(mask>>bit)&1?"positive":"negative"];bit++;return pole;}).join(""));}alternativeHypotheses=combinations;}
   else hypothesisStatus="broad_profile";
   let clarity="not_assessed";if(allComplete){if(resolved.length<=rr.clarity.lowResolvedMax||conflicts.length>=rr.clarity.lowConflictMin)clarity="low";else if(resolved.length===rr.clarity.mediumResolvedCount||conflicts.length===1)clarity="medium";else clarity="high";}
   const sorted=dims.slice().sort((a,b)=>Math.abs(dimensions[b].score)-Math.abs(dimensions[a].score)||dims.indexOf(a)-dims.indexOf(b));
   const primaryDisputedDimensions=allComplete&&unresolved.length===0?dims.filter(d=>Math.abs(dimensions[d].score)===Math.min(...dims.map(k=>Math.abs(dimensions[k].score)))):unresolved;
   return {ok:true,testVersion:spec.version,profilePattern:pattern,primaryHypothesis,alternativeHypotheses,hypothesisStatus,clarity,complete:allComplete,missingQuestions,skippedQuestions,unscoredDimensions:unscored,unresolvedDimensions:unresolved,contextAmbiguousDimensions:conflicts,primaryDisputedDimensions,dimensions,supportDimensions:sorted.filter(d=>dimensions[d].complete&&dimensions[d].direction).slice(0,2)};
  }catch(_){return fail("INVALID_INPUT");}
 }
 const api={calculateResult};if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.TypologyScoring=api;
})(typeof globalThis!=="undefined"?globalThis:this);
