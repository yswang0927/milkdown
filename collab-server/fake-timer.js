import { EventEmitter } from 'node:events';

export class TimerType {
  constructor(name, timeout = 3000) {
    this.id = Symbol(`Timer-${name}`);
    this.name = name;
    this.timeout = timeout;
  }

  create = (clock) => {
    return new Timer(clock, this);
  };
}

export class Timer {
  #promise;
  #listener;
  constructor(clock, type) {
    this.event = new EventEmitter();
    this.type = type;
    clock.set(type.id, this);
  }

  start = () => {
    this.#promise ??= new Promise((resolve) => {
      this.#listener = () => {
        resolve();
      };

      this.event.once(this.type.name, this.#listener);
    });

    return this.#promise;
  };

  done = () => {
    this.event.emit(this.type.name);
  };
}
