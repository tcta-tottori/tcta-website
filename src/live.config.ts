// EmDash の内容を Astro の Live Content Collections として登録する（決まり文句。変更しない）。
import { defineLiveCollection } from 'astro:content';
import { emdashLoader } from 'emdash/runtime';

export const collections = {
  _emdash: defineLiveCollection({ loader: emdashLoader() }),
};
