import { describe, expect, it } from 'vitest';
import { classifyBrowser } from '../pwa_install_prompt';

describe('classifyBrowser', () => {
  it('classifies iPhone Safari', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(classifyBrowser(ua)).toBe('ios-safari');
  });

  it('classifies iPad Safari', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
    expect(classifyBrowser(ua)).toBe('ios-safari');
  });

  it('classifies iPhone Chrome (CriOS)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.0.0 Mobile/15E148 Safari/604.1';
    expect(classifyBrowser(ua)).toBe('ios-other');
  });

  it('classifies iPhone Firefox (FxiOS)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/119.0 Mobile/15E148 Safari/604.1';
    expect(classifyBrowser(ua)).toBe('ios-other');
  });

  it('classifies iPhone Edge (EdgiOS)', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/119.0 Mobile/15E148 Safari/604.1';
    expect(classifyBrowser(ua)).toBe('ios-other');
  });

  it('classifies Android Chrome', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';
    expect(classifyBrowser(ua)).toBe('android-chrome');
  });

  it('classifies Android Firefox', () => {
    const ua = 'Mozilla/5.0 (Android 14; Mobile; rv:119.0) Gecko/119.0 Firefox/119.0';
    expect(classifyBrowser(ua)).toBe('android-other');
  });

  it('classifies Android Edge as android-other (EdgA marker)', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 EdgA/119.0.0.0';
    expect(classifyBrowser(ua)).toBe('android-other');
  });

  it('classifies Android Opera as android-other (OPR marker)', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 OPR/76.0.0.0';
    expect(classifyBrowser(ua)).toBe('android-other');
  });

  it('returns null for desktop Chrome', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
    expect(classifyBrowser(ua)).toBeNull();
  });

  it('returns null for desktop Safari', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    expect(classifyBrowser(ua)).toBeNull();
  });

  it('returns null for desktop Firefox', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0';
    expect(classifyBrowser(ua)).toBeNull();
  });
});
