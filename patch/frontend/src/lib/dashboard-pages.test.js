import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_PAGES, getPageDefinition, getPageTitle } from './dashboard-pages.js';

test('getPageDefinition retorna a página solicitada', () => {
  const page = getPageDefinition('treinamento');
  assert.equal(page.key, 'treinamento');
  assert.equal(page.label, 'Treinamento');
});

test('getPageDefinition usa dashboard como fallback', () => {
  const page = getPageDefinition('desconhecida');
  assert.equal(page.key, DASHBOARD_PAGES[0].key);
});

test('getPageTitle expõe o label correto', () => {
  assert.equal(getPageTitle('social'), 'Social');
  assert.equal(getPageTitle('nao-existe'), 'Dashboard');
});
