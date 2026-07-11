#!/usr/bin/env python3
"""
generate_clips_local.py
Runs on your laptop — reads pending clips via your GAS web app,
downloads + trims each one with yt-dlp + ffmpeg, saves to ./clips/,
and updates the sheet row status back via GAS.

Setup (one-time):
  pip install yt-dlp requests
  brew install ffmpeg

Usage:
  python generate_clips_local.py
"""

import os
import re
import subprocess
import sys
import json
import tempfile
from collections import defaultdict
from pathlib import Path

import requests


DEPLOY_ENV = os.environ.get('DEPLOYMENT_ENV', 'local').lower()


def upload_to_drive(file_path, file_name):
    """Upload a file to Google Drive using OAuth2 refresh token.
    Only used when DEPLOYMENT_ENV=github."""
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    folder_id      = os.environ.get('DRIVE_FOLDER_ID', '')
    client_id      = os.environ.get('GOOGLE_CLIENT_ID', '')
    client_secret  = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    refresh_token  = os.environ.get('GOOGLE_REFRESH_TOKEN', '')

    if not all([client_id, client_secret, refresh_token]):
        raise RuntimeError('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN must be set.')

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri='https://oauth2.googleapis.com/token',
        scopes=['https://www.googleapis.com/auth/drive']
    )
    creds.refresh(GoogleRequest())

    service  = build('drive', 'v3', credentials=creds)
    metadata = {'name': file_name, 'parents': [folder_id]}
    media    = MediaFileUpload(file_path, mimetype='video/mp4', resumable=True)
    uploaded = service.files().create(
        body=metadata, media_body=media, fields='id,webViewLink'
    ).execute()
    file_id = uploaded.get('id', '')
    service.permissions().create(
        fileId=file_id, body={'type': 'anyone', 'role': 'reader'}
    ).execute()
    return uploaded.get('webViewLink', '')


def normalize_timestamp(ts):
    """
    Google Sheets auto-converts time strings like '1:10:00' into date objects
    which GAS returns as 'Sat Dec 30 1899 01:10:00 GMT+0530 (...)'.
    Extracts HH:MM:SS back for ffmpeg.
    """
    ts = str(ts).strip()
    if not ts or ts == 'None':
        return '0:00'
    if 'GMT' in ts or '1899' in ts or 'Standard Time' in ts:
        # "Sat Dec 30 1899 01:10:00 GMT+0530 (India Standard Time)"
        parts = ts.split()
        for part in parts:
            if re.match(r'^\d{1,2}:\d{2}:\d{2}$', part):
                return part
    return ts


def timestamp_to_seconds(ts):
    """Convert HH:MM:SS or MM:SS or SS to total seconds."""
    ts = normalize_timestamp(ts).strip()
    parts = ts.split(':')
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        else:
            return float(parts[0])
    except ValueError:
        return 0.0


# ── Config ─────────────────────────────────────────────────────────────────

# Your GAS web app URL (same as CLIP_FUNCTION_URL minus the clip generator part)
GAS_URL  = os.environ.get('GAS_URL', '')
API_KEY  = os.environ.get('API_KEY', '')

# Where to save generated clips on your laptop
OUTPUT_DIR = Path(__file__).parent / 'clips'

# ── GAS API helpers ─────────────────────────────────────────────────────────

def gas_post(action, params=None):
    payload = {'action': action, 'apiKey': API_KEY}
    if params:
        payload.update(params)
    r = requests.post(GAS_URL, json=payload, headers={'Content-Type': 'text/plain'})
    r.raise_for_status()
    return r.json()


def get_pending_clips():
    result = gas_post('listClips')
    if not result.get('success'):
        raise RuntimeError(result.get('error', 'listClips failed'))
    return [c for c in result.get('clips', []) if c.get('status') == 'pending']


def mark_generating(row_index):
    gas_post('updateClipStatus', {'rowIndex': row_index, 'status': 'generating'})


def mark_ready(row_index, file_path):
    gas_post('updateClipStatus', {'rowIndex': row_index, 'status': 'ready',
                                   'driveLink': str(file_path)})


def mark_error(row_index, error_msg):
    gas_post('updateClipStatus', {'rowIndex': row_index, 'status': 'error',
                                   'errorMsg': error_msg[:500]})


# ── Video processing ────────────────────────────────────────────────────────

def download_video(video_url, tmpdir):
    out_template = os.path.join(tmpdir, 'video.%(ext)s')
    cmd = [
        'yt-dlp',
        '--format', 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--output', out_template,
        '--no-playlist',
    ]

    cookies_file = os.environ.get('COOKIES_FILE', '')
    if DEPLOY_ENV == 'github' and cookies_file and os.path.exists(cookies_file):
        cmd += ['--cookies', cookies_file]
        print(f'  Using cookies file: {cookies_file}')

    cmd.append(video_url)
    print(f'  Downloading: {video_url}')
    result = subprocess.run(cmd, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f'yt-dlp failed with exit code {result.returncode}')
    for fname in os.listdir(tmpdir):
        if fname.startswith('video') and fname.endswith('.mp4'):
            return os.path.join(tmpdir, fname)
    raise RuntimeError('Downloaded file not found.')


def trim_video(input_path, start, end, output_path):
    start_secs    = timestamp_to_seconds(start)
    end_secs      = timestamp_to_seconds(end)
    duration_secs = max(1.0, end_secs - start_secs)

    print(f'  Trimming {start} → {end}  ({duration_secs:.1f}s, re-encoding...)')

    cmd = [
        'ffmpeg',
        '-ss', str(start_secs),   # seek by seconds — most accurate
        '-i', input_path,
        '-t', str(duration_secs), # duration (not end time) — always unambiguous
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-avoid_negative_ts', 'make_zero',
        '-y',
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f'ffmpeg failed: {result.stderr[-800:]}')


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    if not GAS_URL or not API_KEY:
        print('ERROR: Set GAS_URL and API_KEY environment variables.')
        print('  export GAS_URL=https://script.google.com/macros/s/YOUR_ID/exec')
        print('  export API_KEY=your_api_key')
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print('Fetching pending clips from sheet...')
    pending = get_pending_clips()

    if not pending:
        print('No pending clips found. Nothing to do.')
        return

    print(f'Found {len(pending)} pending clip(s).\n')

    # Group by video URL to download each video only once
    by_video = defaultdict(list)
    for clip in pending:
        by_video[clip.get('videoUrl', '').strip()].append(clip)

    for video_url, clips in by_video.items():
        print(f'Video: {video_url}  ({len(clips)} clip(s))')

        with tempfile.TemporaryDirectory() as tmpdir:
            # Download once for all clips from this video
            try:
                video_path = download_video(video_url, tmpdir)
            except Exception as exc:
                print(f'  ERROR downloading video: {exc}')
                for clip in clips:
                    mark_error(clip['rowIndex'], f'Download failed: {exc}')
                continue

            # Trim each clip
            for clip in clips:
                row_index  = clip['rowIndex']
                clip_title = clip.get('clipTitle', 'clip').strip()
                start      = normalize_timestamp(clip.get('start', ''))
                end        = normalize_timestamp(clip.get('end', ''))
                safe_title   = re.sub(r'[^\w\-\s]', '', clip_title)[:50].strip() or 'clip'
                out_filename = safe_title + '.mp4'
                out_path     = OUTPUT_DIR / out_filename

                print(f'  [{row_index}] {clip_title}  ({start} → {end})')

                try:
                    mark_generating(row_index)
                    trim_video(video_path, start, end, str(out_path))

                    if DEPLOY_ENV == 'github':
                        file_link = upload_to_drive(str(out_path), out_filename)
                        print(f'    Uploaded to Drive: {file_link}')
                        mark_ready(row_index, file_link)
                    else:
                        size_kb = out_path.stat().st_size // 1024
                        print(f'    Saved: {out_path}  ({size_kb} KB)')
                        mark_ready(row_index, str(out_path))

                    print(f'    Sheet updated → ready')
                except Exception as exc:
                    print(f'    ERROR: {exc}')
                    mark_error(row_index, str(exc))

        print()

    print('Done.')


if __name__ == '__main__':
    main()

