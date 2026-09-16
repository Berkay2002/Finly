import common from './common';
import format from './format';
import nav from './nav';
import taxonomy from './taxonomy';
import welcome from './welcome';
import onboarding from './onboarding';
import settings from './settings';
import sample from './sample';
import layout from './layout';
import ui from './ui';
import sync from './sync';
import expenses from './expenses';
import bills from './bills';
import household from './household';
import loans from './loans';
import income from './income';
import goals from './goals';
import accounts from './accounts';
import dashboard from './dashboard';
import insights from './insights';
import planning from './planning';
import everyday from './everyday';
import summary from './summary';

/** The English dictionary is the source of truth: every other language must match its shape. */
const en = {
  common,
  format,
  nav,
  taxonomy,
  welcome,
  onboarding,
  settings,
  sample,
  layout,
  ui,
  sync,
  expenses,
  bills,
  household,
  loans,
  income,
  goals,
  accounts,
  dashboard,
  insights,
  planning,
  everyday,
  summary,
};

export type Messages = typeof en;

export default en;
