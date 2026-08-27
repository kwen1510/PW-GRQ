import { appendChunk, createClip, updateClip } from './db.js';

const ROTATE_MS = 40_000;

function supportedMimeType() {
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
    .find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export class DurableRecorder {
  constructor({ onClipReady, onState, onDevices }) {
    this.onClipReady = onClipReady;
    this.onState = onState;
    this.onDevices = onDevices;
    this.stream = null;
    this.recorder = null;
    this.context = null;
    this.sequence = 0;
    this.writeChain = null;
    this.lifecycle = null;
    this.rotationTimer = null;
    this.storageError = null;
    this.pendingTransitions = 0;
  }

  transition(task) {
    this.pendingTransitions += 1;
    const previous = this.lifecycle || Promise.resolve();
    const operation = previous.then(task, task).finally(() => { this.pendingTransitions -= 1; });
    this.lifecycle = operation.catch(() => {});
    return operation;
  }

  hasPendingPersistence() {
    return this.pendingTransitions > 0 || this.recorder?.state === 'recording';
  }

  async devices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
    this.onDevices?.(devices);
    return devices;
  }

  connect(deviceId = '') {
    return this.transition(() => this._connect(deviceId));
  }

  async _connect(deviceId = '') {
    await this._disconnect();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });
    await this.devices();
    const settings = this.stream.getAudioTracks()[0]?.getSettings() || {};
    this.onState?.({ state: 'connected', settings });
    return settings;
  }

  begin(context) {
    return this.transition(() => this._begin(context));
  }

  async _begin(context) {
    if (!this.stream) throw new Error('Select and connect a microphone first');
    if (this.recorder?.state === 'recording') await this._stopClip();
    this.context = { ...context, clipId: crypto.randomUUID() };
    this.sequence = 0;
    this.storageError = null;
    this.writeChain = Promise.resolve();
    const mimeType = supportedMimeType();
    await createClip({
      id: this.context.clipId,
      sessionId: context.sessionId,
      questionId: context.questionId,
      questionIndex: context.questionIndex,
      speaker: context.speaker,
      mimeType
    });
    this.recorder = new MediaRecorder(this.stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 96_000
    });
    this.recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;
      const sequence = this.sequence++;
      const clipId = this.context.clipId;
      this.writeChain = this.writeChain.then(async () => {
        if (this.storageError) return;
        await appendChunk(clipId, sequence, event.data);
      }).catch(async (error) => {
        if (this.storageError) return;
        this.storageError = error;
        await updateClip(clipId, { status: 'storage-error', finalized: false, error: 'Local audio storage failed. Recording stopped to prevent silent data loss.' }).catch(() => {});
        if (this.recorder?.state === 'recording') this.recorder.stop();
        this.onState?.({ state: 'error', error: new Error('Local audio storage failed. Recording has stopped; free device storage before continuing.') });
      });
    };
    this.recorder.start(1000);
    this.rotationTimer = setTimeout(() => this.rotate().catch((error) => this.onState?.({ state: 'error', error })), ROTATE_MS);
    this.onState?.({ state: 'recording', speaker: context.speaker });
  }

  rotate() {
    return this.transition(async () => {
      if (this.recorder?.state !== 'recording') return;
      const next = { ...this.context };
      delete next.clipId;
      await this._stopClip();
      if (!this.storageError) await this._begin(next);
    });
  }

  stopClip() {
    return this.transition(() => this._stopClip());
  }

  async _stopClip() {
    clearTimeout(this.rotationTimer);
    if (!this.recorder || this.recorder.state === 'inactive') {
      this.recorder = null;
      return null;
    }
    const recorder = this.recorder;
    const context = { ...this.context };
    await new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true });
      recorder.requestData();
      recorder.stop();
    });
    const writes = this.writeChain;
    await writes;
    this.recorder = null;
    if (this.storageError) return null;
    await updateClip(context.clipId, { status: 'ready', finalized: true, expectedChunks: this.sequence, completedAt: new Date().toISOString() });
    this.onState?.({ state: 'saved', clipId: context.clipId });
    // Upload/transcription must never hold the microphone rotation path open.
    // The complete clip is already durable in IndexedDB at this point.
    Promise.resolve(this.onClipReady?.(context.clipId)).catch((error) => {
      this.onState?.({ state: 'error', error });
    });
    return context.clipId;
  }

  disconnect() {
    return this.transition(() => this._disconnect());
  }

  async _disconnect() {
    let finalClipId = null;
    if (this.recorder?.state === 'recording') finalClipId = await this._stopClip();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.onState?.({ state: 'disconnected' });
    return finalClipId;
  }
}
