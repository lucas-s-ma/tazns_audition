// One ordered queue per field; a newer edit can never be overtaken by an older request.
export type SaveStatus = 'Saved' | 'Saving' | 'Error';
export class FieldQueue<T> {
  value: T;
  dirty = false;
  status: SaveStatus = 'Saved';
  error = '';
  private version = 0;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  constructor(
    initial: T,
    private save: (value: T) => Promise<unknown>,
    private notify: () => void,
  ) {
    this.value = initial;
  }
  setNotify(notify: () => void) {
    this.notify = notify;
  }
  receive(value: T) {
    if (!this.dirty) {
      this.value = value;
      this.notify();
    }
  }
  edit(value: T, immediate = false) {
    this.value = value;
    this.dirty = true;
    this.version++;
    this.retries = 0;
    this.status = 'Saving';
    this.notify();
    clearTimeout(this.timer);
    if (immediate) void this.flush();
    else this.timer = setTimeout(() => void this.flush(), 700);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      if (this.dirty && !this.failed()) return this.flush();
      return;
    }
    if (!this.dirty) return;
    const version = this.version,
      value = this.value;
    this.status = 'Saving';
    this.error = '';
    this.notify();
    this.running = (async () => {
      try {
        await this.save(value);
        if (version === this.version) {
          this.dirty = false;
          this.status = 'Saved';
          this.retries = 0;
        }
      } catch (error) {
        this.status = 'Error';
        this.error = error instanceof Error ? error.message : 'Save failed';
        if (this.retries++ < 2)
          this.timer = setTimeout(() => void this.flush(), 1000 * this.retries);
      } finally {
        this.notify();
      }
    })();
    await this.running;
    this.running = null;
    if (this.dirty && !this.failed()) return this.flush();
  }
  private failed() {
    return this.status === 'Error';
  }
  dispose() {
    clearTimeout(this.timer);
    void this.flush();
  }
}
