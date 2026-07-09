from fastapi import FastAPI
from pydantic import BaseModel
from .chatbot import (extract_video_id,get_transcript,get_info,get_metadata_doc,get_transcript_doc,get_chain,)
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

video_chains = {}
current_video = None   

class VideoRequest(BaseModel):
    url: str

class ChatRequest(BaseModel):
    question: str

@app.get("/")
def home():
    return {"message": "Welcome to the YouTube Chatbot API!"}

@app.post("/load_video")
def load_video(request: VideoRequest):
    global current_video
    
    video_id = extract_video_id(request.url)

    if video_id is None:
        return {"error": "Invalid YouTube URL."}
    
    current_video = video_id

    if video_id in video_chains:
        return {"message": "Video already loaded. You can ask questions now."}  
    
    transcript = get_transcript(video_id)

    if transcript is None:
        return {"error": "Transcript not available for this video."}
    
    info = get_info(request.url)
    
    if  info is None:
        return {"error": "Failed to fetch video info."}
    
    metadata_doc = get_metadata_doc(info)
    transcript_doc = get_transcript_doc(transcript)

    chain = get_chain(metadata_doc, transcript_doc)

    video_chains[video_id] = chain

    return {"message": "Video loaded successfully."}

@app.post("/ask")
def ask_question(request: ChatRequest):
    global current_video

    if current_video is None:
        return {"error": "No video loaded. Please load a video first."}
    
    current_chain = video_chains.get(current_video)

    if current_chain is None:
        return {"error": "Please load the video first or transcript is unavailable."}

    answer = current_chain.invoke(request.question)

    return {"answer": answer}