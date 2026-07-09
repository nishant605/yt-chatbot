from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
from youtube_transcript_api.proxies import WebshareProxyConfig
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_groq import ChatGroq
from langchain_core.runnables import RunnableParallel, RunnablePassthrough, RunnableLambda
from langchain_core.output_parsers import StrOutputParser
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import PromptTemplate
from langchain_cohere import CohereEmbeddings
from dotenv import load_dotenv
import yt_dlp
from langchain_core.documents import Document
import re
import os
load_dotenv()

llm = ChatGroq(model = "llama-3.3-70b-versatile")
embeddings = CohereEmbeddings(model="embed-english-v3.0")

def extract_video_id(url: str) -> str | None:
    """
    Extracts the video ID from a YouTube URL.

    Args:
        url (str): The YouTube video URL.
    """
    try:
       match = re.search(r"(?:youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]{11})",url,)
       return match.group(1) if match else None
    except Exception as e:
        print(f"Error extracting video ID: {e}")
        return None

def get_transcript(video_id) -> str | None:
    try:
        ytt_api = YouTubeTranscriptApi(
        proxy_config=WebshareProxyConfig(
        proxy_username=os.environ["WEBSHARE_USERNAME"],
        proxy_password=os.environ["WEBSHARE_PASSWORD"],
    )
        )
        transcript_list = ytt_api.fetch(video_id, languages=['en', 'hi'])
        transcript = " ".join([t.text for t in transcript_list])
        return transcript
    except TranscriptsDisabled:
        print("Transcripts are disabled for this video.")
        return None
    except Exception as e:
        print(f"Error fetching transcript: {e}")
        return None
    
def get_info(url) -> dict:

    ydl_opts = {
    "quiet": True, #yt-dlp will not print messages to the console
    "skip_download": True, #don't download the video
}
    try:

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info
        
    except Exception as e:
        print(f"Error fetching video info: {e}")
        return None

def get_metadata_doc(info):

    if info is None:
        return ValueError("Video info is None. Cannot create metadata document.")
    
    title = info["title"]
    description = info["description"]
    channel = info["uploader"]
    thumbnail = info["thumbnail"]
    duration = info["duration"]
    views = info["view_count"]
    upload_date = info["upload_date"]

    metadata_doc = Document(
        page_content=f"""
    Title: {title}

    Channel: {channel}

    Description:
    {description}
    """)

    return metadata_doc

def get_transcript_doc(transcript):

    if transcript is None:
        return ValueError("Transcript is None. Cannot create transcript document.")

    transcript_doc = Document(
        page_content=transcript
    )

    return transcript_doc

def get_retriever(transcript_doc, metadata_doc):

    metadata_vs = FAISS.from_documents([metadata_doc], embeddings)
    metadata_retriever = metadata_vs.as_retriever(search_type="similarity", search_kwargs={"k": 1})

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
    chunks = splitter.split_documents([transcript_doc])

    transcript_vs = FAISS.from_documents(chunks, embeddings)

    transcript_retriever = transcript_vs.as_retriever(
    search_type="mmr",
    search_kwargs={
        "k": 5,
        "fetch_k": 30,
        "lambda_mult": 0.7
    })

    return transcript_retriever, metadata_retriever

def format_docs(documents):
    context_text = "\n\n".join(doc.page_content for doc in documents)
    return context_text

prompt = PromptTemplate(
    input_variables=["context", "question"],
    template="""
You are an expert AI assistant for answering questions about a YouTube video.

Your knowledge is LIMITED to the provided video information.

The provided context may contain:
- Title
- Channel
- Description
- Transcript
- Metadata

Rules:
- Rules:
- Always answer in English.
- Translate any quoted Hindi content into natural English.
- Do not answer in Hindi unless the user explicitly asks.
- Use ONLY the provided context.
- Never make up facts.
- Never use external knowledge.
- If the answer is missing, say:
  "I couldn't find that information in this video."
- If multiple retrieved chunks contain relevant information, combine them into one complete answer.
- If the context contains conflicting information, state that clearly.
- Prefer metadata when answering questions about:
  • video title
  • guest
  • host
  • channel
  • upload details
- Keep answers conversational and easy to understand.
- Do not mention that you received chunks or context.

Context:
{context}

Question:
{question}

Answer:
"""
)

def retrieve(question,metadata_retriever, transcript_retriever):

    metadata_keywords = [
        "title",
        "channel",
        "guest",
        "host",
        "description",
        "thumbnail",
        "views",
        "upload"
    ]

    if any(k in question.lower() for k in metadata_keywords):
        docs = metadata_retriever.invoke(question)
    else:
        docs = transcript_retriever.invoke(question)

    return format_docs(docs)

def get_chain(transcript_doc, metadata_doc):

    parser = StrOutputParser()

    transcript_retriever, metadata_retriever = get_retriever(transcript_doc, metadata_doc)

    return RunnableParallel({
        'context':RunnableLambda(lambda _: retrieve(_,metadata_retriever, transcript_retriever)),
        'question':RunnablePassthrough() 
    }) | prompt | llm | parser
