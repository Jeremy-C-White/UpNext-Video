import { expect, test, describe, vi, beforeEach, afterEach } from 'vitest';
import { checkAndNotifyUpcomingEpisodes } from './notifications';
import { UserShow } from '../types';

const _globalNotification = global.Notification;

describe('Notifications', () => {
  const NotificationMock = vi.fn();
  (NotificationMock as any).permission = 'granted';
  (NotificationMock as any).requestPermission = vi.fn().mockResolvedValue('granted');
  
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T12:00:00Z'));
    global.Notification = NotificationMock as any; global.window = { navigator: { userAgent: 'test' } } as any; (global.window as any).Notification = NotificationMock;
    
    const store = new Map();
    global.localStorage = {
      getItem: vi.fn(key => store.get(key) || null),
      setItem: vi.fn((key, value) => store.set(key, value)),
      clear: vi.fn(() => store.clear()),
      removeItem: vi.fn(key => store.delete(key)),
    } as any;
    
    // Default notifications to enabled
    localStorage.setItem("NEXTUP_NOTIFICATIONS_ENABLED", "true");
    NotificationMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.Notification = _globalNotification;
  });

  test('sends soon notification for episode airing in 1 hour', async () => {
    const show: UserShow = {
      id: '1', name: 'Test Show',
      episodes: [
        { id: '101', name: 'Ep 1', season: 1, number: 1, airstamp: '2026-07-26T13:00:00Z' } // 1 hour from now
      ]
    } as any;

    await checkAndNotifyUpcomingEpisodes([show]);
    
    expect(NotificationMock).toHaveBeenCalledTimes(1);
    expect(NotificationMock).toHaveBeenCalledWith(
      expect.stringContaining('Airing Soon'),
      expect.objectContaining({ body: expect.stringContaining('airs in 60 minutes') })
    );
  });

  test('sends available notification for episode aired recently', async () => {
    const show: UserShow = {
      id: '1', name: 'Test Show',
      episodes: [
        { id: '101', name: 'Ep 1', season: 1, number: 1, airstamp: '2026-07-26T11:00:00Z' } // 1 hour ago
      ]
    } as any;

    await checkAndNotifyUpcomingEpisodes([show]);
    
    expect(NotificationMock).toHaveBeenCalledTimes(1);
    expect(NotificationMock).toHaveBeenCalledWith(
      expect.stringContaining('Now Available'),
      expect.objectContaining({ body: expect.stringContaining('has officially aired') })
    );
  });
});
