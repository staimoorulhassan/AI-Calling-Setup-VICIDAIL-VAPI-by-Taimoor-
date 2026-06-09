"""
MOSS-TTS inference script.
Loads model from ./TTS directory, downloads audio tokenizer from HuggingFace if needed.
Outputs: output.wav
"""
import torch
import soundfile as sf
from transformers import AutoModel, AutoProcessor

MODEL_PATH = "./TTS"
CODEC_PATH = "OpenMOSS-Team/MOSS-Audio-Tokenizer"
TEXT = "Hello."
OUTPUT_FILE = "output.wav"

device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16  # ~16 GB for 8B model, fits in 24 GB RAM

print(f"Device: {device}, dtype: {dtype}")
print("Loading processor...")

processor = AutoProcessor.from_pretrained(
    MODEL_PATH,
    trust_remote_code=True,
    codec_path=CODEC_PATH,
)
processor.audio_tokenizer = processor.audio_tokenizer.to(device)

print("Loading model (may take a while on CPU)...")
model = AutoModel.from_pretrained(
    MODEL_PATH,
    trust_remote_code=True,
    attn_implementation="sdpa",
    dtype=torch.float16,
    low_cpu_mem_usage=True,
).to(device).eval()

print(f"Generating audio for: '{TEXT}'")
conversation = [processor.build_user_message(text=TEXT)]
batch = processor(conversation, mode="generation")
batch = {k: v.to(device) for k, v in batch.items()}

with torch.no_grad():
    outputs = model.generate(**batch, max_new_tokens=32)

messages = processor.decode(outputs)
if messages and messages[0].audio_codes_list:
    audio = messages[0].audio_codes_list[0].cpu().float().numpy()
    sf.write(OUTPUT_FILE, audio, processor.model_config.sampling_rate)
    print(f"Saved: {OUTPUT_FILE}")
else:
    print("No audio generated.")
