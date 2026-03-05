import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  BookOpen, 
  History, 
  Trash2, 
  ChevronRight,
  Loader2,
  CheckCircle2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { extractSubtitles, explainSentence } from './services/gemini';
import { VideoData, Subtitle, SentenceExplanation, ArchiveEntry } from './types';
import { cn, formatTime, parseTimeToSeconds } from './lib/utils';

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<VideoData | null>(null);
  const [selectedTimestamps, setSelectedTimestamps] = useState<string[]>([]);
  const [explanations, setExplanations] = useState<Record<string, SentenceExplanation>>({});
  const [isExplaining, setIsExplaining] = useState(false);
  const [archives, setArchives] = useState<VideoData[]>([]);
  const [showArchives, setShowArchives] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchArchives();
  }, []);

  const fetchArchives = async () => {
    try {
      const res = await fetch('/api/videos');
      const videos = await res.json();
      setArchives(videos);
    } catch (e) {
      console.error(e);
    }
  };

  const loadArchive = async (video: VideoData) => {
    const transcription = typeof video.transcription === 'string' 
      ? JSON.parse(video.transcription) 
      : video.transcription;
      
    setCurrentVideo({ ...video, transcription });
    setVideoUrl(null);
    setShowArchives(false);
    
    // Fetch explanations for this video
    try {
      const res = await fetch(`/api/explanations/${video.id}`);
      const data = await res.json();
      const newExplanations: Record<string, SentenceExplanation> = {};
      const timestamps: string[] = [];
      
      data.forEach((e: any) => {
        newExplanations[e.timestamp] = e.content;
        timestamps.push(e.timestamp);
      });
      
      setExplanations(newExplanations);
      setSelectedTimestamps(timestamps);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteVideo = async (id: string) => {
    try {
      await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      setArchives(prev => prev.filter(v => v.id !== id));
      if (currentVideo?.id === id) {
        setCurrentVideo(null);
        setExplanations({});
        setSelectedTimestamps([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [learnedTimestamps, setLearnedTimestamps] = useState<Set<string>>(new Set());

  const toggleLearned = (ts: string) => {
    setLearnedTimestamps(prev => {
      const next = new Set(prev);
      if (next.has(ts)) next.delete(ts);
      else next.add(ts);
      return next;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (500,000 KB = 512,000,000 bytes approx)
    if (file.size > 600 * 1024 * 1024) {
      alert("文件过大，请上传小于600MB的视频。");
      return;
    }

    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setIsProcessing(true);

    try {
      // For very large files, we might want to sample or just send the first 20MB 
      // but Gemini 1.5 Flash can handle larger files if we use the File API.
      // In this environment, we'll try to send the whole thing if it's within limits,
      // or warn the user.
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        
        // If base64 is too large for inlineData (20MB limit), we might need to slice it
        // but let's try to optimize by sending a smaller version or just the first part for demo.
        // Real production would use the File API upload.
        let dataToSend = base64;
        if (base64.length > 25 * 1024 * 1024) {
          console.warn("Video too large for direct inlineData, sending first 20MB for analysis.");
          dataToSend = base64.substring(0, 20 * 1024 * 1024);
        }

        const subtitles = await extractSubtitles(dataToSend, file.type);
        
        const videoData: VideoData = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          transcription: subtitles,
          created_at: new Date().toISOString()
        };

        setCurrentVideo(videoData);
        await fetch('/api/videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(videoData)
        });

        setIsProcessing(false);
        fetchArchives();
      };
    } catch (error) {
      console.error("Failed to process video:", error);
      setIsProcessing(false);
    }
  };

  const toggleTimestamp = (ts: string) => {
    setSelectedTimestamps(prev => 
      prev.includes(ts) ? prev.filter(t => t !== ts) : [...prev, ts]
    );
  };

  const handleExplain = async () => {
    if (selectedTimestamps.length === 0 || !currentVideo) return;
    
    setIsExplaining(true);
    const sortedTimestamps = [...selectedTimestamps].sort((a, b) => 
      parseTimeToSeconds(a) - parseTimeToSeconds(b)
    );

    const newExplanations: Record<string, SentenceExplanation> = { ...explanations };

    for (const ts of sortedTimestamps) {
      if (newExplanations[ts]) continue;

      const subtitle = currentVideo.transcription.find(s => s.timestamp === ts);
      if (subtitle) {
        try {
          const explanation = await explainSentence(subtitle.text);
          newExplanations[ts] = explanation;
          
          // Save to archive
          await fetch('/api/explanations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              video_id: currentVideo.id,
              timestamp: ts,
              content: explanation
            })
          });
        } catch (e) {
          console.error(`Failed to explain ${ts}:`, e);
        }
      }
    }

    setExplanations(newExplanations);
    setIsExplaining(false);
  };

  const seekTo = (ts: string) => {
    if (videoRef.current) {
      videoRef.current.currentTime = parseTimeToSeconds(ts);
      videoRef.current.play();
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center bg-white/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#141414] rounded-full flex items-center justify-center text-[#E4E3E0]">
            <BookOpen size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">影学日和</h1>
            <p className="text-[10px] uppercase tracking-widest opacity-50 font-mono">Eigaku Hiyori / Movie Study</p>
          </div>
        </div>
        
        <div className="flex gap-4">
          <button 
            onClick={() => setShowArchives(!showArchives)}
            className="flex items-center gap-2 px-4 py-2 border border-[#141414] rounded-full text-sm hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
          >
            <History size={16} />
            存档
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-[#E4E3E0] rounded-full text-sm hover:opacity-90 transition-all"
          >
            <Upload size={16} />
            导入视频
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="video/*" 
            className="hidden" 
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Video & Controls */}
        <div className="lg:col-span-7 space-y-6">
          <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl relative group">
            {videoUrl ? (
              <video 
                ref={videoRef}
                src={videoUrl} 
                className="w-full h-full object-contain"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                controls
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-white/30 gap-4">
                <div className="w-20 h-20 border-2 border-dashed border-white/20 rounded-full flex items-center justify-center">
                  <Play size={32} />
                </div>
                <p className="text-sm font-mono uppercase tracking-widest">Waiting for video input</p>
              </div>
            )}
            
            {isProcessing && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-4 z-10">
                <Loader2 className="animate-spin" size={40} />
                <p className="text-sm font-mono uppercase tracking-widest">AI Analyzing Subtitles...</p>
              </div>
            )}
          </div>

          {/* Selected Explanations */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs uppercase tracking-widest font-mono opacity-50">Grammar & Vocabulary Analysis</h2>
              {selectedTimestamps.length > 0 && (
                <button 
                  onClick={handleExplain}
                  disabled={isExplaining}
                  className="text-xs font-bold underline underline-offset-4 hover:opacity-70 disabled:opacity-30"
                >
                  {isExplaining ? 'ANALYZING...' : 'START EXPLANATION'}
                </button>
              )}
            </div>

            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {selectedTimestamps.sort((a, b) => parseTimeToSeconds(a) - parseTimeToSeconds(b)).map(ts => (
                  <motion.div 
                    key={ts}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white border border-[#141414] rounded-2xl p-6 shadow-sm"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs bg-[#141414] text-[#E4E3E0] px-2 py-1 rounded">
                          {ts}
                        </span>
                        <p className="text-lg font-medium">
                          {currentVideo?.transcription.find(s => s.timestamp === ts)?.text}
                        </p>
                      </div>
                      <button onClick={() => toggleTimestamp(ts)} className="opacity-30 hover:opacity-100">
                        <X size={16} />
                      </button>
                    </div>

                    {explanations[ts] ? (
                      <div className="space-y-6">
                        <div>
                          <h4 className="text-[10px] uppercase tracking-widest font-mono opacity-50 mb-3">语法解析 (Grammar)</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr className="border-b border-[#141414]">
                                  <th className="text-left py-2 font-mono text-[10px] uppercase opacity-50 w-1/3">语法点</th>
                                  <th className="text-left py-2 font-mono text-[10px] uppercase opacity-50">详细解释</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#141414]/10">
                                {explanations[ts].grammar.map((g, i) => (
                                  <tr key={i}>
                                    <td className="py-3 pr-4 font-bold align-top">{g.point}</td>
                                    <td className="py-3 align-top leading-relaxed">{g.explanation}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        
                        <div className="h-px bg-[#141414]/10" />

                        <div>
                          <h4 className="text-[10px] uppercase tracking-widest font-mono opacity-50 mb-3">词汇表 (Vocabulary)</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {explanations[ts].vocabulary.map((v, i) => (
                              <div key={i} className="flex flex-col p-3 bg-[#F5F5F3] rounded-xl border border-[#141414]/5">
                                <div className="flex justify-between items-start mb-1">
                                  <div className="flex flex-col">
                                    <span className="text-[10px] opacity-50 font-mono">{v.reading}</span>
                                    <span className="font-bold text-base">{v.word}</span>
                                  </div>
                                  <span className="text-[10px] px-1.5 py-0.5 bg-[#141414]/5 rounded italic opacity-50">{v.category}</span>
                                </div>
                                <span className="text-xs opacity-70 mt-1">{v.meaning}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end pt-4">
                          <button 
                            onClick={() => toggleLearned(ts)}
                            className={cn(
                              "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all",
                              learnedTimestamps.has(ts) 
                                ? "bg-emerald-100 text-emerald-700 border border-emerald-200" 
                                : "border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0]"
                            )}
                          >
                            {learnedTimestamps.has(ts) ? (
                              <><CheckCircle2 size={14} /> 已掌握</>
                            ) : (
                              "标记为已掌握"
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="h-24 flex items-center justify-center border border-dashed border-[#141414]/10 rounded-xl">
                        <p className="text-xs font-mono opacity-30 italic">Pending analysis...</p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {selectedTimestamps.length === 0 && (
                <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-[#141414]/10 rounded-3xl text-[#141414]/30">
                  <BookOpen size={32} className="mb-2" />
                  <p className="text-sm">点击右侧字幕时间点开始学习</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Subtitles List */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-[#141414] rounded-3xl overflow-hidden flex flex-col h-[calc(100vh-180px)] sticky top-28 shadow-xl">
            <div className="p-6 border-b border-[#141414] flex justify-between items-center bg-[#F5F5F3]">
              <h3 className="font-bold tracking-tight">字幕列表</h3>
              <span className="text-[10px] font-mono opacity-50">{currentVideo?.transcription.length || 0} LINES</span>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {currentVideo ? (
                <div className="divide-y divide-[#141414]/5">
                  {currentVideo.transcription.map((sub, idx) => {
                    const isSelected = selectedTimestamps.includes(sub.timestamp);
                    const isCurrent = Math.abs(parseTimeToSeconds(sub.timestamp) - currentTime) < 2;
                    const isLearned = learnedTimestamps.has(sub.timestamp);
                    
                    return (
                      <div 
                        key={idx}
                        className={cn(
                          "p-4 transition-all cursor-pointer group flex gap-4 border-l-4",
                          isSelected ? "bg-[#141414] text-[#E4E3E0] border-[#141414]" : "hover:bg-[#F5F5F3] border-transparent",
                          isCurrent && !isSelected && "border-[#141414]",
                          isLearned && !isSelected && "bg-emerald-50/50"
                        )}
                        onClick={() => toggleTimestamp(sub.timestamp)}
                      >
                        <div 
                          className={cn(
                            "font-mono text-[10px] mt-1 w-16 shrink-0",
                            isSelected ? "text-[#E4E3E0]/70" : "opacity-40"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            seekTo(sub.timestamp);
                          }}
                        >
                          {sub.timestamp}
                        </div>
                        <div className="flex-1">
                          <p className={cn(
                            "text-sm leading-relaxed",
                            isLearned && !isSelected && "opacity-50"
                          )}>{sub.text}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {isLearned && <CheckCircle2 size={14} className="text-emerald-500" />}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {isSelected ? <CheckCircle2 size={14} /> : <ChevronRight size={14} />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center text-[#141414]/30">
                  <Upload size={40} className="mb-4 opacity-20" />
                  <p className="text-sm">导入视频后自动提取字幕</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Archive Sidebar */}
      <AnimatePresence>
        {showArchives && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowArchives(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#E4E3E0] border-l border-[#141414] z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-8 border-b border-[#141414] flex justify-between items-center bg-white">
                <h2 className="text-2xl font-bold tracking-tight italic serif">Archive</h2>
                <button onClick={() => setShowArchives(false)} className="p-2 hover:bg-[#141414]/5 rounded-full">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <p className="text-xs font-mono opacity-50 uppercase tracking-widest">Saved Learning Progress</p>
                
                <div className="space-y-4">
                  {archives.length > 0 ? (
                    archives.map(video => (
                      <div key={video.id} className="p-6 bg-white border border-[#141414] rounded-2xl group relative">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-lg leading-tight pr-8">{video.name}</h4>
                          <button 
                            onClick={() => deleteVideo(video.id)}
                            className="absolute top-6 right-6 p-2 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <p className="text-[10px] font-mono opacity-40 mb-4 uppercase tracking-widest">
                          {new Date(video.created_at).toLocaleDateString()}
                        </p>
                        <button 
                          onClick={() => loadArchive(video)}
                          className="w-full py-3 border border-[#141414] rounded-xl text-sm font-bold hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                        >
                          加载学习记录
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="p-12 border-2 border-dashed border-[#141414]/10 rounded-3xl text-center">
                      <History size={32} className="mx-auto mb-4 opacity-20" />
                      <p className="text-sm opacity-40">暂无存档记录</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #14141420;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #14141440;
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Serif+JP:wght@400;700&display=swap');
      `}</style>
    </div>
  );
}
