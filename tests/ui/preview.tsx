/** Browser fixture for the actual React surfaces; never included in plugin builds. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MediaViewProvider, type LangPlayerPluginRef} from '../../src/context';
import {StudyWorkbench} from '../../src/components/player/StudyWorkbench';
import {VocabularyPanel} from '../../src/components/vocabulary/VocabularyPanel';
import {DEFAULT_SETTINGS} from '../../src/types';
import {useSubtitleStore} from '../../src/store/subtitleStore';
import {usePlaybackStore} from '../../src/store/playbackStore';
import {useRecordingStore} from '../../src/store/recordingStore';
import {useUIStore} from '../../src/store/uiStore';
import {setLanguage} from '../../src/i18n';
const params = new URLSearchParams(location.search);
setLanguage(params.get('lang') === 'en' ? 'en' : 'zh');
if (params.has('dark')) document.body.classList.add('theme-dark');
const sentences = [
  ['The best way to learn is to stay curious.', '最好的学习方式，是保持好奇心。'],
  ['Every conversation is a chance to see the world differently.', '每一次对话，都是重新认识世界的机会。'],
  ['You do not have to understand every single word.', '你不必理解每一个词。'],
  ['Listen for the idea, and let the details come naturally.', '先听懂意思，让细节自然浮现。'],
  ['Small steps can take you a surprisingly long way.', '一小步一小步，也能走得出乎意料地远。'],
  ['Make a little time for the things that matter to you.', '为你在乎的事留一点时间。'],
];
const cues = Array.from({length: 30},(_,i)=>({id:String(i),index:i,start:i*6,end:i*6+5,text:sentences[i%6]![0]!,textEn:sentences[i%6]![0]!,textZh:sentences[i%6]![1]!}));
const entries = ['curious','conversation','naturally','surprisingly','perspective','intention','embrace'].map((word,i)=>({id:i+1,word,definition:['Eager to know or learn something.','An exchange of ideas between people.','Without effort or preparation.'][i%3],translation:['好奇的；求知欲强的','交谈；对话','自然地'][i%3],context:cues[i%6]!.text,sentenceZh:cues[i%6]!.textZh,source:'The art of staying curious',mediaUrl:'/sample.wav',mediaTime:i*6,status:(['learning','unknown','mastered'] as const)[i%3]!,createdAt:Date.now()-i*86400000}));
const noop = async()=>{};
const settings=structuredClone(DEFAULT_SETTINGS);
settings.studyHabit.enabled=true;
const source={type:'url' as const,url:'/sample.wav',displayName:'The art of staying curious'};
const plugin={settings,saveSettings:noop,app:{workspace:{getLeavesOfType:()=>[]},vault:{getName:()=> 'Preview'},plugins:{plugins:{}}},noteService:{saveToNote:async()=>true,openStudyNote:noop,saveAllSubtitlesToNote:noop},vocabDb:{getAll:async()=>entries,updateWord:noop},flashcardService:{startReview:()=>{},refreshWordDb:noop,refreshReviewDb:noop},openMediaPicker:()=>{},openVocabulary:()=>{location.search='?vocab'},openSubtitlePanel:noop,openMediaAt:noop,loadSubtitleFromVault:()=>{},getPlaybackProgress:()=>6,setPlaybackProgress:()=>{},getDictationProgress:()=>undefined,setDictationProgress:noop,clearDictationProgress:noop,recordStudyActivity:async()=>settings.studyHabitProgress,dismissStudyRecoveryPrompt:async()=>settings.studyHabitProgress} as unknown as LangPlayerPluginRef;
useSubtitleStore.getState().setSubtitles(cues);
useSubtitleStore.getState().setActiveIndex(1);
usePlaybackStore.getState().setSource(source);
if (params.has('recording')) {
  useUIStore.getState().setStudyMode('shadow');
  useRecordingStore.getState().setLastRecording({url:'/sample.wav',durationSec:180,filePath:'preview.wav',subtitleText:cues[1]!.text});
}
createRoot(document.getElementById('root')!).render(<MediaViewProvider plugin={plugin} source={source}>{params.has('vocab') ? <VocabularyPanel/> : <StudyWorkbench source={source}/>}</MediaViewProvider>);
