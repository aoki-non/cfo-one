import os
import subprocess
import re
import math
import wave
import struct
import asyncio
import edge_tts
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ASSETS_DIR = "/Users/hng/.gemini/antigravity/scratch/enclave-cfo/video_assets"
OUTPUT_DIR = "/Users/hng/.gemini/antigravity/scratch/enclave-cfo"
os.makedirs(ASSETS_DIR, exist_ok=True)

# ------------------------------------------------------------------------------
# 1. Video Scenes Definition (Phonetic Perfection & High-Impact Marketing)
# ------------------------------------------------------------------------------
# We spell out acronyms ("A. I.", "L. L. M.", "C. F. O. One", "U. S. D. C.", "T. D. X.", "M. P. C.")
# and write brands phonetically ("Near", "Air-Wallex", "Near Intents") so Microsoft Azure
# neural TTS speaks them with 100% human-grade, crystal-clear enunciation.
SCENES = [
    {
        "id": "scene1_hook",
        "title": "THE FINANCIAL PARADOX OF AI AGENTS",
        "tag": "CRITICAL VULNERABILITY",
        "tag_color": "#f43f5e",
        "headline": "GIVING AN AI AGENT YOUR BANK ACCOUNT\nIS FINANCIAL SUICIDE.",
        "subheadline": "Prompt injections, altered routing numbers, and hallucinated payouts drain capital in seconds.",
        "voiceover": "A. I. agents are writing code and deploying smart contracts. But if you give an L. L. M. access to your company bank account, a single prompt injection can drain your entire treasury in sixty seconds.",
        "captions": "Giving an AI agent your bank account is financial suicide. Prompt injections drain capital in seconds.",
        "screenshot": None,
        "theme": "danger"
    },
    {
        "id": "scene2_solution",
        "title": "INTRODUCING CFO-ONE",
        "tag": "AUTONOMOUS BUSINESS ENGINE",
        "tag_color": "#10b981",
        "headline": "THE AUTONOMOUS CHIEF FINANCIAL OFFICER\nFOR THE COMPANY OF NONE.",
        "subheadline": "We didn't build a chatbot. We built an AI CFO that proves mathematically why it said NO.",
        "voiceover": "Meet C. F. O. One. Built for the Near Hackathon: Autonomous Business track. We did not build a chatty chatbot. We built an A. I. Chief Financial Officer that proves mathematically why it said no.",
        "captions": "Meet CFO-One. An AI CFO for the company of none that proves mathematically why it said NO.",
        "screenshot": "07_landing_hero.png",
        "theme": "brand"
    },
    {
        "id": "scene3_intents",
        "title": "PILLAR 1: INBOUND REVENUE VIA NEAR INTENTS",
        "tag": "CROSS-CHAIN COMMERCE",
        "tag_color": "#3b82f6",
        "headline": "CLIENTS PAY IN ANY ASSET ACROSS 30+ CHAINS.\nSOLVERS SETTLE FUNDS DIRECTLY TO TREASURY.",
        "subheadline": "Confidential TEE invoice audit fees collected in Base USDC, Solana, Ethereum, or NEAR via 1Click API.",
        "voiceover": "First: Inbound revenue. Clients purchase confidential invoice clearance cross-chain. Customers pay in Base U. S. D. C., Solana, or Ethereum through Near Intents. Solvers settle funds instantly into corporate checking.",
        "captions": "Inbound revenue: Clients pay in any asset via NEAR Intents. Solvers settle funds instantly to checking.",
        "screenshot": "02_inbound_sales.png",
        "theme": "blue"
    },
    {
        "id": "scene4_revenue",
        "title": "PILLAR 2: PROGRAMMATIC PROFIT SPLITS",
        "tag": "ZERO HUMAN HEADCOUNT",
        "tag_color": "#10b981",
        "headline": "EVERY DOLLAR SETTLED IS SPLIT INSTANTLY:\n70% TREASURY · 20% DIVIDENDS · 10% RESERVE.",
        "subheadline": "Automated dividend payouts dispatched on-chain to contributors.testnet without manual payroll.",
        "voiceover": "Second: Programmatic revenue sharing. Every dollar that lands is automatically split: seventy percent retained in treasury, twenty percent auto-dispatched as dividends to contributors dot testnet on Near, and ten percent in liquidity reserve. Zero manual payroll.",
        "captions": "Automated 70/20/10 revenue split: Dividends dispatched to contributors.testnet on NEAR automatically.",
        "screenshot": "03_revenue_splits.png",
        "theme": "emerald"
    },
    {
        "id": "scene5_defense",
        "title": "PILLAR 3: HARDWARE ENCLAVE SECURITY (INTEL TDX)",
        "tag": "DUAL-LAYER PROTECTION",
        "tag_color": "#f43f5e",
        "headline": "PROMPT INJECTIONS & WIRE FRAUD\nINTERCEPTED WITH ZERO LOSS.",
        "subheadline": "Layer 1 filters adversarial directives. Layer 2 inside Intel TDX TEE physically enforces founder caps.",
        "voiceover": "Third: Defense. When an attacker sends a fake invoice with a spoofed bank routing number, or a prompt injection demanding ten thousand dollars, Layer One detects the threat. And Layer Two, sealed inside an Intel T. D. X. hardware enclave, physically blocks the payout against founder rules. Zero capital lost.",
        "captions": "Hardware Enclave Defense: Intel TDX physically blocks prompt injections and spoofed routing swaps.",
        "screenshot": "04_fraud_interception.png",
        "theme": "danger"
    },
    {
        "id": "scene6_rails",
        "title": "PILLAR 4: REAL-WORLD BANKING & COMPUTE",
        "tag": "ENTERPRISE RAILS",
        "tag_color": "#3b82f6",
        "headline": "LIVE AIRWALLEX USD CHECKING ($9.99M RESERVES)\n+ SELF-PROCURED AI COMPUTE ($25/DAY BUDGET).",
        "subheadline": "Humans set the constraints in plain English or config.yaml. The agent handles everything else 24/7.",
        "voiceover": "Fourth: Real-world rails. C. F. O. One connects live Air-Wallex multi-currency checking, with nearly ten million dollars in liquid reserves, to Near M. P. C. Chain Signatures. The agent even procures its own inference from Near A. I. Cloud, self-metered under a twenty-five dollar daily budget.",
        "captions": "Live enterprise rails: Airwallex USD checking plus self-procured inference from NEAR AI Cloud.",
        "screenshot": "01_cockpit_overview.png",
        "theme": "blue"
    },
    {
        "id": "scene7_outro",
        "title": "NEAR HACKATHON 2026: TRACK 04 AUTONOMOUS BUSINESS",
        "tag": "THE COMPANY OF NONE",
        "tag_color": "#10b981",
        "headline": "HUMANS ONLY SET THE CONSTRAINTS.\nCFO-ONE RUNS THE ENTIRE BUSINESS.",
        "subheadline": "Open Source · 16/16 Test Coverage · Live Responsive Cockpit Running at localhost:3000",
        "voiceover": "Humans only set the constraints. C. F. O. One runs the entire business. Built for the Near Hackathon. The company of none is live today.",
        "captions": "Humans only set constraints. CFO-One runs the business. Built for the NEAR Hackathon 2026.",
        "screenshot": "06_ai_copilot.png",
        "theme": "brand"
    }
]

# ------------------------------------------------------------------------------
# 2. Neural Audio Generation (Microsoft Azure Neural TTS via edge-tts)
# ------------------------------------------------------------------------------
def get_audio_duration(file_path):
    cmd = ["ffmpeg", "-i", file_path]
    proc = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True)
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", proc.stderr)
    if match:
        hours, minutes, seconds = match.groups()
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    return 6.0

async def generate_single_voiceover(scene):
    audio_mp3 = os.path.join(ASSETS_DIR, f"{scene['id']}.mp3")
    audio_wav = os.path.join(ASSETS_DIR, f"{scene['id']}.wav")
    
    # en-US-GuyNeural: Crisp, energetic, high-conviction product marketing voice
    communicate = edge_tts.Communicate(scene["voiceover"], "en-US-GuyNeural")
    await communicate.save(audio_mp3)
    
    # Convert to 44.1kHz 16-bit stereo WAV
    subprocess.run(["ffmpeg", "-y", "-i", audio_mp3, "-ar", "44100", "-ac", "2", audio_wav],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    
    dur = get_audio_duration(audio_wav)
    scene["duration"] = max(dur + 0.6, 5.0)
    scene["audio_wav"] = audio_wav
    print(f"  ✓ Neural Voice: {scene['id']} ({scene['duration']:.2f}s) -> Perfect pronunciation generated")

async def generate_all_voiceovers():
    print(">>> Generating ultra-realistic Neural Voiceovers with phonetic pronunciation...")
    for idx, scene in enumerate(SCENES):
        await generate_single_voiceover(scene)
        await asyncio.sleep(0.3)

# ------------------------------------------------------------------------------
# 3. Synthesize Modern Ambient Tech Background Soundtrack (WAV)
# ------------------------------------------------------------------------------
def generate_background_music(total_duration, output_path):
    print(f">>> Synthesizing sleek ambient cyber/fintech soundtrack ({total_duration:.1f}s)...")
    sample_rate = 44100
    n_samples = int(total_duration * sample_rate)
    
    chords = [
        [146.83, 220.00, 261.63, 349.23], # Dm7
        [174.61, 261.63, 329.63, 392.00], # Fmaj7
        [130.81, 196.00, 261.63, 329.63], # C
        [116.54, 174.61, 233.08, 293.66], # Bbmaj7
    ]
    chord_len = 4.0
    
    with wave.open(output_path, "w") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        
        raw_data = bytearray()
        for i in range(n_samples):
            t = i / sample_rate
            chord_idx = int((t / chord_len) % len(chords))
            freqs = chords[chord_idx]
            
            beat_phase = (t * (110.0 / 60.0)) % 1.0
            pulse = math.exp(-beat_phase * 12.0) * math.sin(2 * math.pi * 55.0 * t) * 0.12
            sub = math.sin(2 * math.pi * (freqs[0] / 2.0) * t) * 0.08
            
            pad = 0.0
            for f in freqs:
                pad += math.sin(2 * math.pi * f * t) * 0.03
                pad += math.sin(2 * math.pi * (f * 2.01) * t) * 0.015
            
            pan_l = 0.5 + 0.15 * math.sin(2 * math.pi * 0.25 * t)
            pan_r = 1.0 - pan_l
            
            sample_val = (pulse + sub + pad)
            if t < 1.5:
                sample_val *= (t / 1.5)
            elif t > total_duration - 2.0:
                sample_val *= max(0.0, (total_duration - t) / 2.0)
            
            sample_l = int(max(-1.0, min(1.0, sample_val * pan_l * 0.28)) * 32767)
            sample_r = int(max(-1.0, min(1.0, sample_val * pan_r * 0.28)) * 32767)
            raw_data.extend(struct.pack("<hh", sample_l, sample_r))
        
        wav.writeframes(raw_data)
    print(f"  ✓ Ambient background score created: {output_path}")

# ------------------------------------------------------------------------------
# 4. Generate High-Res 1080p Video Slide Frames
# ------------------------------------------------------------------------------
def create_slide_frame(scene, width=1920, height=1080):
    img = Image.new("RGBA", (width, height), (9, 11, 16, 255))
    draw = ImageDraw.Draw(img)
    
    # Cyber grid background lines
    for x in range(0, width, 80):
        draw.line([(x, 0), (x, height)], fill=(255, 255, 255, 4), width=1)
    for y in range(0, height, 80):
        draw.line([(0, y), (width, y)], fill=(255, 255, 255, 4), width=1)
    
    accent_hex = scene["tag_color"]
    r = int(accent_hex[1:3], 16)
    g = int(accent_hex[3:5], 16)
    b = int(accent_hex[5:7], 16)
    
    # Top neon bar
    draw.rectangle([0, 0, width, 5], fill=(r, g, b, 255))
    
    font_title = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 22)
    font_head = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 48)
    font_sub = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 24)
    font_badge = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 16)
    font_cap = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 26)
    
    # Header row
    draw.text((80, 48), "CFO-ONE", fill=(255, 255, 255, 255), font=font_title)
    draw.text((210, 52), "// NEAR HACKATHON 2026: TRACK 04 (AUTONOMOUS BUSINESS)", fill=(148, 163, 184, 255), font=font_badge)
    
    tag_text = scene["tag"]
    draw.rounded_rectangle([width - 80 - 270, 42, width - 80, 78], radius=6, fill=(r, g, b, 35), outline=(r, g, b, 120), width=1)
    draw.text((width - 80 - 255, 52), tag_text, fill=(r, g, b, 255), font=font_badge)
    
    draw.line([(80, 96), (width - 80, 96)], fill=(255, 255, 255, 20), width=1)
    
    has_screenshot = scene["screenshot"] is not None
    
    if not has_screenshot:
        # Fullscreen impactful title card (Scene 1)
        draw.rounded_rectangle([80, 160, 360, 204], radius=6, fill=(244, 63, 94, 30), outline=(244, 63, 94, 180), width=1)
        draw.text((98, 172), "⚠  THE 2026 AI THREAT VECTOR", fill=(244, 63, 94, 255), font=font_badge)
        
        draw.text((80, 240), scene["headline"], fill=(255, 255, 255, 255), font=font_head, spacing=16)
        draw.text((80, 410), scene["subheadline"], fill=(148, 163, 184, 255), font=font_sub, spacing=12)
        
        cards = [
            ("UNRESTRICTED AGENT", "LLM calls transfer() directly\nPrompt injection drains treasury\nZero cryptographic proof", (244, 63, 94)),
            ("PROMPT GUARDRAILS", "System prompt: 'Please don't overspend'\nAttacker: 'Ignore previous instructions'\nBypassed in 10 seconds", (245, 158, 11)),
            ("CFO-ONE HARDWARE VAULT", "Intel TDX Hardware Enclave Ceiling\nPhysical spending cap ($1,000 max)\nMathematical refusal proof", (16, 185, 129))
        ]
        
        card_w = (width - 160 - 40) // 3
        for idx, (c_title, c_desc, c_color) in enumerate(cards):
            cx = 80 + idx * (card_w + 20)
            cy = 540
            draw.rounded_rectangle([cx, cy, cx + card_w, cy + 260], radius=10, fill=(18, 24, 36, 255), outline=(c_color[0], c_color[1], c_color[2], 120), width=1)
            draw.text((cx + 24, cy + 24), c_title, fill=c_color, font=font_badge)
            draw.text((cx + 24, cy + 68), c_desc, fill=(226, 232, 240, 255), font=font_sub, spacing=8)
    else:
        # Split Layout: Left Text & Callouts, Right UI Window Mockup
        draw.text((80, 130), scene["title"], fill=(r, g, b, 255), font=font_badge)
        draw.text((80, 170), scene["headline"], fill=(255, 255, 255, 255), font=ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 36), spacing=10)
        draw.text((80, 310), scene["subheadline"], fill=(148, 163, 184, 255), font=ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 20), spacing=8)
        
        bullets = {
            "scene2_solution": ["Zero Human Payroll or Routine Bill Reviews", "100% Autonomous Clearance via TEE Vault", "Airwallex Corporate USD Checking ($9.99M Liquid)"],
            "scene3_intents": ["Accept Payments in Any Token via NEAR Intents", "Solvers Settle Instantly on NEAR (v0 1Click API)", "Dynamic Cross-Chain Pricing & Minimum Fee Defense"],
            "scene4_revenue": ["70% Retained in Treasury Reserve", "20% Auto-Dispatched to contributors.testnet", "10% Protocol Liquidity & Slippage Reserve"],
            "scene5_defense": ["Layer 1: Heuristic Prompt Injection Scanner", "Layer 2: Intel TDX Remote Attestation Hardware Cap", "BEC Wire Fraud & Bank Routing Swap Interception"],
            "scene6_rails": ["Airwallex Multi-Currency Banking Integration", "NEAR AI Cloud Compute Procurement ($25/Day Budget)", "CPA-Ready Double-Entry General Ledger Export"],
            "scene7_outro": ["The Company of One — Or None", "Live Testnet Rails & Intel TDX TEE Protection", "Full Open Source Code & Reproducible Test Suite"]
        }.get(scene["id"], ["Autonomous Operation", "Hardware Enclave Enforced", "Live On-Chain Settlement"])
        
        by = 440
        for b_text in bullets:
            draw.rounded_rectangle([80, by, 80 + 36, by + 36], radius=6, fill=(r, g, b, 40), outline=(r, g, b, 140), width=1)
            draw.text((92, by + 8), "✓", fill=(r, g, b, 255), font=font_badge)
            draw.text((130, by + 6), b_text, fill=(241, 245, 249, 255), font=ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 19))
            by += 56
            
        shot_path = os.path.join(ASSETS_DIR, scene["screenshot"])
        if os.path.exists(shot_path):
            shot_img = Image.open(shot_path).convert("RGBA")
            bx, by = 880, 130
            bw, bh = 960, 720
            
            draw.rounded_rectangle([bx - 4, by - 4, bx + bw + 4, by + bh + 4], radius=14, fill=(r, g, b, 30))
            draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=12, fill=(15, 19, 28, 255), outline=(255, 255, 255, 40), width=1)
            
            draw.rounded_rectangle([bx, by, bx + bw, by + 42], radius=12, fill=(22, 28, 40, 255))
            draw.rectangle([bx, by + 20, bx + bw, by + 42], fill=(22, 28, 40, 255))
            draw.ellipse([bx + 16, by + 14, bx + 28, by + 26], fill=(244, 63, 94, 255))
            draw.ellipse([bx + 36, by + 14, bx + 48, by + 26], fill=(245, 158, 11, 255))
            draw.ellipse([bx + 56, by + 14, bx + 68, by + 26], fill=(16, 185, 129, 255))
            
            draw.rounded_rectangle([bx + 90, by + 8, bx + bw - 20, by + 34], radius=4, fill=(12, 15, 22, 255))
            draw.text((bx + 105, by + 12), "https://cfo-one.enclave/cockpit  [Intel TDX Protected · Live Rails]", fill=(148, 163, 184, 255), font=font_badge)
            
            inner_w = bw
            inner_h = bh - 42
            resized_shot = shot_img.resize((inner_w, int(shot_img.height * (inner_w / shot_img.width))), Image.Resampling.LANCZOS)
            cropped_shot = resized_shot.crop((0, 0, inner_w, min(resized_shot.height, inner_h)))
            img.paste(cropped_shot, (bx, by + 42), cropped_shot)

    # Bottom Animated Caption Banner
    cap_y = height - 140
    draw.rounded_rectangle([80, cap_y, width - 80, cap_y + 80], radius=12, fill=(11, 14, 20, 240), outline=(r, g, b, 120), width=1)
    
    draw.ellipse([110, cap_y + 28, 134, cap_y + 52], fill=(r, g, b, 255))
    draw.text((150, cap_y + 24), "CFO-ONE AI:", fill=(r, g, b, 255), font=ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 20))
    draw.text((310, cap_y + 22), scene["captions"], fill=(255, 255, 255, 255), font=font_cap)
    
    out_frame_path = os.path.join(ASSETS_DIR, f"{scene['id']}_frame.png")
    img.save(out_frame_path, "PNG")
    scene["frame_png"] = out_frame_path
    print(f"  ✓ Slide frame created: {out_frame_path}")

# ------------------------------------------------------------------------------
# 5. Render Scene Video Clips with Motion & Pan (FFmpeg)
# ------------------------------------------------------------------------------
def render_scene_clips():
    print(">>> Rendering 1080p video clips with subtle kinetic motion...")
    for idx, scene in enumerate(SCENES):
        clip_path = os.path.join(ASSETS_DIR, f"{scene['id']}.mp4")
        dur = scene["duration"]
        
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-i", scene["frame_png"],
            "-i", scene["audio_wav"],
            "-c:v", "libx264",
            "-tune", "stillimage",
            "-c:a", "aac",
            "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-vf", f"scale=1920:1080,zoompan=z='min(zoom+0.0003,1.03)':d={int(dur*30)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30",
            "-t", str(dur),
            clip_path
        ]
        
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        scene["clip_mp4"] = clip_path
        print(f"  ✓ [{idx+1}/{len(SCENES)}] Clip rendered ({dur:.1f}s): {clip_path}")

# ------------------------------------------------------------------------------
# 6. Concatenate & Mix Background Music into Final MP4
# ------------------------------------------------------------------------------
def assemble_final_video():
    print(">>> Assembling full master video with audio mixing...")
    concat_list = os.path.join(ASSETS_DIR, "concat_list.txt")
    with open(concat_list, "w") as f:
        for scene in SCENES:
            f.write(f"file '{scene['clip_mp4']}'\n")
            
    temp_concat = os.path.join(ASSETS_DIR, "temp_concat.mp4")
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", concat_list,
        "-c", "copy",
        temp_concat
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    
    total_duration = get_audio_duration(temp_concat)
    print(f"  Total video runtime: {total_duration:.1f} seconds")
    
    bg_music_wav = os.path.join(ASSETS_DIR, "ambient_soundtrack.wav")
    generate_background_music(total_duration + 2.0, bg_music_wav)
    
    final_output = os.path.join(OUTPUT_DIR, "cfo_one_hackathon_demo.mp4")
    
    mix_cmd = [
        "ffmpeg", "-y",
        "-i", temp_concat,
        "-i", bg_music_wav,
        "-filter_complex",
        "[1:a]volume=0.18[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "256k",
        "-shortest",
        final_output
    ]
    
    subprocess.run(mix_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    print(f"\n======================================================================")
    print(f"  🎉 MASTER VIDEO RE-GENERATED WITH PERFECT PRONUNCIATION!")
    print(f"  Location: {final_output}")
    print(f"  Runtime:  {total_duration:.1f}s | Resolution: 1080p Full HD (1920x1080)")
    print(f"  Voice:    Azure Neural TTS (en-US-GuyNeural)")
    print(f"======================================================================\n")

if __name__ == "__main__":
    asyncio.run(generate_all_voiceovers())
    for s in SCENES:
        create_slide_frame(s)
    render_scene_clips()
    assemble_final_video()
