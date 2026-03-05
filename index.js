/**
 * index.js — SalonFlow (single bot for many salons)
 * Node.js + Telegraf + Express
 *
 * Start params:
 *  - admin_salon_001  => admin onboarding (trial / payment link)
 *  - salon_001        => client flow (menu + booking)
 *
 * IMPORTANT:
 *  - This bot assumes your Google Apps Script WebApp accepts JSON:
 *    { secret, action, ...payload }
 */

const express = require("express");
const { Telegraf, Markup, session } = require("telegraf");

// -------------------- ENV --------------------
const BOT_TOKEN = mustStr("BOT_TOKEN");
const PUBLIC_URL = mustStr("PUBLIC_URL");            // e.g. https://your-railway-domain.up.railway.app
const WEBHOOK_PATH = str("WEBHOOK_PATH", "/tg-hook"); // Telegram webhook endpoint path
const PORT = Number(str("PORT", "8080"));

const GAS_URL = mustStr("GAS_URL");        // Apps Script WebApp URL (exec)
const GAS_SECRET = mustStr("GAS_SECRET");  // must match API_SECRET in Apps Script

// Optional: onboarding payment link (if you want)
const SAAS_CONNECT_PAY_URL = str("SAAS_CONNECT_PAY_URL", "");

// Optional: super admin chat id (platform owner)
const SUPER_ADMIN_CHAT_ID = Number(str("SUPER_ADMIN_CHAT_ID", "0")) || 0;

// Payment webhook endpoint
const PAY_WEBHOOK_PATH = str("PAY_WEBHOOK_PATH", "/pay/webhook");

// -------------------- APP --------------------
const app = express();
app.use(express.json({ limit: "1mb" }));

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// -------------------- i18n --------------------
const LANGS = ["ua", "ru", "en"];
const DEFAULT_LANG = "ua";

const T = {
  ua: {
    menu_services: "💼 Послуги",
    menu_masters: "👩‍🔧 Майстри",
    menu_contacts: "📞 Контакти",
    menu_lang: "🌐 Змінити мову",

    pick_action: "Оберіть дію:",
    back: "⬅️ Назад",
    next: "➡️ Далі",
    home: "🏠 В головне меню",

    services_title: "💼 Послуги",
    masters_title: "👩‍🔧 Майстри",
    contacts_title: "📞 Контакти",

    choose_service: "Оберіть послугу:",
    choose_master: "Оберіть майстра:",
    choose_time: "Оберіть час:",
    service_details: (s) =>
      `*${esc(s.name)}*\n\n${s.description ? esc(s.description) + "\n\n" : ""}🕒 Тривалість: *${s.durationMin} хв*\n💰 Ціна: *${s.price} ${esc(s.currency || "")}*`,
    master_services_title: (m) => `Послуги майстра: *${esc(m)}*`,
    no_services: "Послуг поки немає.",
    no_masters: "Майстрів поки немає.",
    no_slots: "Вільних слотів не знайдено на 7 днів вперед.",

    btn_pick_master: "Вибрати майстра",
    btn_pick_time: "Вибрати час",

    pay_title: "Оплата",
    pay_online: "💳 Оплата онлайн",
    pay_cash: "💵 Оплата на місці",
    booking_created: "✅ Запис створено.",
    pay_waiting: "Статус оплати: *WAITING*",
    pay_none: "Статус оплати: *NONE*",
    pay_link: "Посилання для оплати:",
    cancel_btn: "❌ Скасувати запис",
    cancelled_ok: "✅ Запис скасовано.",

    lang_pick: "Оберіть мову:",
    lang_set: (l) => `Мову встановлено: *${l.toUpperCase()}*`,

    admin_welcome: (salonId) =>
      `Режим адміна для *${esc(salonId)}*\n\n1) Оплатити підключення\n2) Або активувати TRIAL 15 днів`,
    admin_trial_btn: "🆓 TRIAL 15 днів",
    admin_pay_btn: "💳 Оплатити підключення",
    admin_trial_ok: (data) =>
      `✅ Ви підключені (TRIAL).\n\n📄 Таблиця салону: ${data.spreadsheetUrl}\n\n👥 Посилання для клієнтів:\n${data.clientLink}\n`,
    admin_trial_fail: (e) => `❌ TRIAL не активовано: ${esc(e)}`,

    err_generic: "Помилка. Спробуйте ще раз.",
    err_no_salon: "Не бачу salonId. Запускайте через правильне посилання.",
  },

  ru: {
    menu_services: "💼 Услуги",
    menu_masters: "👩‍🔧 Мастера",
    menu_contacts: "📞 Контакты",
    menu_lang: "🌐 Сменить язык",

    pick_action: "Выберите действие:",
    back: "⬅️ Назад",
    next: "➡️ Далее",
    home: "🏠 В главное меню",

    services_title: "💼 Услуги",
    masters_title: "👩‍🔧 Мастера",
    contacts_title: "📞 Контакты",

    choose_service: "Выберите услугу:",
    choose_master: "Выберите мастера:",
    choose_time: "Выберите время:",
    service_details: (s) =>
      `*${esc(s.name)}*\n\n${s.description ? esc(s.description) + "\n\n" : ""}🕒 Длительность: *${s.durationMin} мин*\n💰 Цена: *${s.price} ${esc(s.currency || "")}*`,
    master_services_title: (m) => `Услуги мастера: *${esc(m)}*`,
    no_services: "Услуг пока нет.",
    no_masters: "Мастеров пока нет.",
    no_slots: "Свободных слотов нет на 7 дней вперёд.",

    btn_pick_master: "Выбрать мастера",
    btn_pick_time: "Выбрать время",

    pay_title: "Оплата",
    pay_online: "💳 Оплата онлайн",
    pay_cash: "💵 Оплата на месте",
    booking_created: "✅ Запись создана.",
    pay_waiting: "Статус оплаты: *WAITING*",
    pay_none: "Статус оплаты: *NONE*",
    pay_link: "Ссылка для оплаты:",
    cancel_btn: "❌ Отменить запись",
    cancelled_ok: "✅ Запись отменена.",

    lang_pick: "Выберите язык:",
    lang_set: (l) => `Язык установлен: *${l.toUpperCase()}*`,

    admin_welcome: (salonId) =>
      `Режим админа для *${esc(salonId)}*\n\n1) Оплатить подключение\n2) Или активировать TRIAL 15 дней`,
    admin_trial_btn: "🆓 TRIAL 15 дней",
    admin_pay_btn: "💳 Оплатить подключение",
    admin_trial_ok: (data) =>
      `✅ Вы подключены (TRIAL).\n\n📄 Таблица салона: ${data.spreadsheetUrl}\n\n👥 Ссылка для клиентов:\n${data.clientLink}\n`,
    admin_trial_fail: (e) => `❌ TRIAL не активирован: ${esc(e)}`,

    err_generic: "Ошибка. Попробуйте ещё раз.",
    err_no_salon: "Не вижу salonId. Запускайте по правильной ссылке.",
  },

  en: {
    menu_services: "💼 Services",
    menu_masters: "👩‍🔧 Masters",
    menu_contacts: "📞 Contacts",
    menu_lang: "🌐 Change language",

    pick_action: "Choose an action:",
    back: "⬅️ Back",
    next: "➡️ Next",
    home: "🏠 Main menu",

    services_title: "💼 Services",
    masters_title: "👩‍🔧 Masters",
    contacts_title: "📞 Contacts",

    choose_service: "Choose a service:",
    choose_master: "Choose a master:",
    choose_time: "Choose a time:",
    service_details: (s) =>
      `*${esc(s.name)}*\n\n${s.description ? esc(s.description) + "\n\n" : ""}🕒 Duration: *${s.durationMin} min*\n💰 Price: *${s.price} ${esc(s.currency || "")}*`,
    master_services_title: (m) => `Master services: *${esc(m)}*`,
    no_services: "No services yet.",
    no_masters: "No masters yet.",
    no_slots: "No available slots for the next 7 days.",

    btn_pick_master: "Choose master",
    btn_pick_time: "Choose time",

    pay_title: "Payment",
    pay_online: "💳 Pay online",
    pay_cash: "💵 Pay on site",
    booking_created: "✅ Booking created.",
    pay_waiting: "Payment status: *WAITING*",
    pay_none: "Payment status: *NONE*",
    pay_link: "Payment link:",
    cancel_btn: "❌ Cancel booking",
    cancelled_ok: "✅ Booking cancelled.",

    lang_pick: "Choose language:",
    lang_set: (l) => `Language set: *${l.toUpperCase()}*`,

    admin_welcome: (salonId) =>
      `Admin mode for *${esc(salonId)}*\n\n1) Pay connection\n2) Or activate TRIAL 15 days`,
    admin_trial_btn: "🆓 TRIAL 15 days",
    admin_pay_btn: "💳 Pay connection",
    admin_trial_ok: (data) =>
      `✅ Connected (TRIAL).\n\n📄 Salon sheet: ${data.spreadsheetUrl}\n\n👥 Client link:\n${data.clientLink}\n`,
    admin_trial_fail: (e) => `❌ TRIAL failed: ${esc(e)}`,

    err_generic: "Error. Try again.",
    err_no_salon: "Missing salonId. Open bot via correct link.",
  },
};

// -------------------- Session state --------------------
function ensureState(ctx) {
  if (!ctx.session) ctx.session = {};
  if (!ctx.session.lang || !LANGS.includes(ctx.session.lang)) ctx.session.lang = DEFAULT_LANG;
  if (!ctx.session.flow) ctx.session.flow = {};
  return ctx.session;
}

function L(ctx) {
  const s = ensureState(ctx);
  return T[s.lang] || T[DEFAULT_LANG];
}

// -------------------- Telegram reply keyboard --------------------
function mainMenuKb(ctx) {
  const t = L(ctx);
  return Markup.keyboard(
    [
      [t.menu_services, t.menu_masters],
      [t.menu_contacts, t.menu_lang],
    ],
    { resize_keyboard: true }
  );
}

// -------------------- salonId normalizer (FIX) --------------------
// Accepts: "salon003", "salon_003", "003", "salon3", "salon_3"
// Returns: "salon_003" (pad to 3 digits)
function normalizeSalonId(input) {
  const raw = String(input || "").trim();

  // already salon_XXX
  let m = raw.match(/^salon_(\d{1,6})$/i);
  if (m) return `salon_${m[1].padStart(3, "0")}`;

  // salonXXX (no underscore)
  m = raw.match(/^salon(\d{1,6})$/i);
  if (m) return `salon_${m[1].padStart(3, "0")}`;

  // just digits
  m = raw.match(/^(\d{1,6})$/);
  if (m) return `salon_${m[1].padStart(3, "0")}`;

  // unknown format -> keep as is (but it will likely fail in GAS)
  return raw;
}

// -------------------- GAS API helper --------------------
async function gasCall(action, payload) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: GAS_SECRET, action, ...payload }),
  });

  const text = await res.text();

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GAS non-JSON response: ${text?.slice(0, 120)}`);
  }

  if (!data || data.ok !== true) {
    // IMPORTANT: show exact GAS error in Railway logs
    console.error("GAS ERROR:", { action, payload, data });
    throw new Error(data?.error || "GAS error");
  }
  return data;
}

// -------------------- Start router --------------------
bot.start(async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);

  const startParamRaw = (ctx.startPayload || "").trim();
  if (!startParamRaw) {
    s.flow = { mode: "client" };
    await ctx.reply(t.err_no_salon, mainMenuKb(ctx));
    return;
  }

  // admin mode
  if (startParamRaw.startsWith("admin_")) {
    const salonIdRaw = startParamRaw.replace(/^admin_/, "").trim();
    const salonId = normalizeSalonId(salonIdRaw); // FIX
    s.flow = { mode: "admin", salonId };
    await showAdminOnboarding(ctx);
    return;
  }

  // client mode
  const salonId = normalizeSalonId(startParamRaw); // FIX
  s.flow = { mode: "client", salonId };
  await ctx.reply(t.pick_action, mainMenuKb(ctx));
});

// -------------------- Admin onboarding --------------------
async function showAdminOnboarding(ctx) {
  const s = ensureState(ctx);
  const t = L(ctx);
  const salonId = s.flow?.salonId;

  const buttons = [];
  if (SAAS_CONNECT_PAY_URL) {
    buttons.push([Markup.button.url(t.admin_pay_btn, SAAS_CONNECT_PAY_URL)]);
  }
  buttons.push([Markup.button.callback(t.admin_trial_btn, `adm_trial:${salonId}`)]);

  await ctx.replyWithMarkdown(
    t.admin_welcome(salonId),
    Markup.inlineKeyboard(buttons)
  );
}

bot.action(/adm_trial:(.+)/, async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);

  // FIX: normalize salonId even from callback
  const salonId = normalizeSalonId(ctx.match[1]);

  try {
    const adminChatId = String(ctx.chat.id);
    const adminUsername = String(ctx.from.username || "");

    const data = await gasCall("activateTrialAndProvision", {
      salonId,
      adminChatId,
      adminUsername,
    });

    const botUser = await ctx.telegram.getMe();

    // FIX: links must use normalized salonId with underscore
    const clientLink = `https://t.me/${botUser.username}?start=${salonId}`;
    const adminLink = `https://t.me/${botUser.username}?start=admin_${salonId}`;

    await ctx.editMessageReplyMarkup();
    await ctx.replyWithMarkdown(
      t.admin_trial_ok({
        ...data,
        clientLink,
        adminLink,
      })
    );

    if (SUPER_ADMIN_CHAT_ID) {
      await ctx.telegram.sendMessage(
        SUPER_ADMIN_CHAT_ID,
        `✅ TRIAL provisioned: ${salonId}\nAdmin: ${adminChatId} (@${adminUsername || "-"})`
      );
    }
  } catch (e) {
    await ctx.replyWithMarkdown(t.admin_trial_fail(e.message || String(e)));
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

// -------------------- Language switch --------------------
bot.hears([T.ua.menu_lang, T.ru.menu_lang, T.en.menu_lang], async (ctx) => {
  const t = L(ctx);
  await ctx.replyWithMarkdown(
    t.lang_pick,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("UA", "lang:ua"),
        Markup.button.callback("RU", "lang:ru"),
        Markup.button.callback("EN", "lang:en"),
      ],
    ])
  );
});

bot.action(/lang:(ua|ru|en)/, async (ctx) => {
  const s = ensureState(ctx);
  const newLang = ctx.match[1];

  s.lang = newLang;
  const t = L(ctx);

  try {
    await ctx.editMessageText(
      t.lang_set(newLang),
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.replyWithMarkdown(t.lang_set(newLang));
  }
  await ctx.reply(t.pick_action, mainMenuKb(ctx));
  try { await ctx.answerCbQuery(); } catch (_) {}
});

// -------------------- Contacts --------------------
bot.hears([T.ua.menu_contacts, T.ru.menu_contacts, T.en.menu_contacts], async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);
  const salonId = s.flow?.salonId;
  if (!salonId) return ctx.reply(t.err_no_salon, mainMenuKb(ctx));

  try {
    const meta = await gasCall("getSalonMeta", { salonId });

    const address = meta.address || meta.meta?.address || "";
    const phone = meta.phone || meta.meta?.phone || "";
    const mapsUrl = meta.mapsUrl || meta.meta?.mapsUrl || meta.meta?.googleMaps || "";

    const lines = [];
    if (address) lines.push(`📍 ${address}`);
    if (phone) lines.push(`☎️ ${phone}`);
    if (mapsUrl) lines.push(`🗺️ ${mapsUrl}`);

    await ctx.reply(lines.length ? lines.join("\n") : t.err_generic, mainMenuKb(ctx));
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  }
});

// -------------------- Services branch --------------------
bot.hears([T.ua.menu_services, T.ru.menu_services, T.en.menu_services], async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);
  const salonId = s.flow?.salonId;
  if (!salonId) return ctx.reply(t.err_no_salon, mainMenuKb(ctx));

  s.flow.selectedService = null;
  s.flow.selectedMasterName = null;
  s.flow.slotsPageToken = null;
  s.flow.booking = null;

  try {
    const list = await gasCall("listServices", { salonId });
    const services = list.services || list.items || list;

    if (!Array.isArray(services) || services.length === 0) {
      return ctx.reply(t.no_services, mainMenuKb(ctx));
    }

    await ctx.replyWithMarkdown(t.choose_service, servicesKb(ctx, services));
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  }
});

function servicesKb(ctx, services) {
  const t = L(ctx);

  const buttons = [];
  const max = Math.min(30, services.length);

  for (let i = 0; i < max; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < max; j++) {
      const s = services[j];
      const serviceId = String(s.serviceId || s.id || s.key || s.name || `svc_${j}`);
      const title = s.price
        ? `${s.name} — ${s.price} ${s.currency || ""}`.trim()
        : String(s.name || serviceId);

      row.push(Markup.button.callback(title.slice(0, 60), `svc:${serviceId}`));
    }
    buttons.push(row);
  }

  buttons.push([Markup.button.callback(t.back, "home")]);
  return Markup.inlineKeyboard(buttons);
}

bot.action("home", async (ctx) => {
  const t = L(ctx);
  try { await ctx.editMessageReplyMarkup(); } catch (_) {}
  await ctx.reply(t.pick_action, mainMenuKb(ctx));
  try { await ctx.answerCbQuery(); } catch (_) {}
});

bot.action(/svc:(.+)/, async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);
  const salonId = s.flow?.salonId;
  const serviceId = ctx.match[1];

  if (!salonId) {
    try { await ctx.answerCbQuery(); } catch (_) {}
    return ctx.reply(t.err_no_salon, mainMenuKb(ctx));
  }

  try {
    const list = await gasCall("listServices", { salonId });
    const services = list.services || list.items || list;

    const svc = (services || []).find((x) => String(x.serviceId || x.id || x.key || x.name) === String(serviceId))
      || (services || []).find((x) => String(x.name) === String(serviceId));

    if (!svc) return ctx.reply(t.err_generic, mainMenuKb(ctx));

    s.flow.selectedService = {
      serviceId: String(svc.serviceId || svc.id || serviceId),
      name: String(svc.name || ""),
      description: String(svc.description || ""),
      durationMin: Number(svc.durationMin || svc.duration || 60),
      price: Number(svc.price || 0),
      currency: String(svc.currency || ""),
      masterName: svc.masterName ? String(svc.masterName) : "",
    };

    const buttons = [];
    buttons.push([Markup.button.callback(t.btn_pick_master, "svc_pick_master")]);
    buttons.push([Markup.button.callback(t.back, "svc_back_list")]);

    await ctx.editMessageText(
      t.service_details(s.flow.selectedService),
      { parse_mode: "Markdown", reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
    );
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

bot.action("svc_back_list", async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);
  const salonId = s.flow?.salonId;
  if (!salonId) return;

  try {
    const list = await gasCall("listServices", { salonId });
    const services = list.services || list.items || list;
    await ctx.editMessageText(
      t.choose_service,
      { parse_mode: "Markdown", reply_markup: servicesKb(ctx, services).reply_markup }
    );
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

bot.action("svc_pick_master", async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);
  const salonId = s.flow?.salonId;
  const selectedService = s.flow?.selectedService;
  if (!salonId || !selectedService) return;

  try {
    if (selectedService.masterName) {
      s.flow.selectedMasterName = selectedService.masterName;
      s.flow.slotsPageToken = null;
      await showSlots(ctx, { reset: true });
      return;
    }

    const mastersRes = await gasCall("listMasters", { salonId });
    const masters = mastersRes.masters || mastersRes.items || mastersRes;

    if (!Array.isArray(masters) || masters.length === 0) {
      return ctx.reply(t.no_masters, mainMenuKb(ctx));
    }

    const filtered = masters.filter((m) => {
      if (m.serviceId) return String(m.serviceId) === String(selectedService.serviceId);
      if (m.services && Array.isArray(m.services)) {
        return m.services.some((x) => String(x.serviceId || x.id || x.name) === String(selectedService.serviceId));
      }
      return true;
    });

    const listToShow = filtered.length ? filtered : masters;

    await ctx.editMessageText(
      t.choose_master,
      { parse_mode: "Markdown", reply_markup: mastersKb(ctx, listToShow).reply_markup }
    );
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

function mastersKb(ctx, masters) {
  const t = L(ctx);
  const buttons = [];

  const max = Math.min(30, masters.length);
  for (let i = 0; i < max; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < max; j++) {
      const m = masters[j];
      const name = String(m.masterName || m.name || m);
      row.push(Markup.button.callback(name.slice(0, 40), `mst:${encode(name)}`));
    }
    buttons.push(row);
  }

  buttons.push([Markup.button.callback(t.back, "svc_back_details")]);
  return Markup.inlineKeyboard(buttons);
}

bot.action("svc_back_details", async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);
  const svc = s.flow?.selectedService;
  if (!svc) return;

  const buttons = [];
  buttons.push([Markup.button.callback(t.btn_pick_master, "svc_pick_master")]);
  buttons.push([Markup.button.callback(t.back, "svc_back_list")]);

  try {
    await ctx.editMessageText(
      t.service_details(svc),
      { parse_mode: "Markdown", reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
    );
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

bot.action(/mst:(.+)/, async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);
  const name = decode(ctx.match[1]);

  s.flow.selectedMasterName = name;
  s.flow.slotsPageToken = null;

  try {
    await showSlots(ctx, { reset: true });
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

// -------------------- Masters branch (choose master -> services -> slots) --------------------
bot.hears([T.ua.menu_masters, T.ru.menu_masters, T.en.menu_masters], async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);
  const salonId = s.flow?.salonId;
  if (!salonId) return ctx.reply(t.err_no_salon, mainMenuKb(ctx));

  s.flow.selectedService = null;
  s.flow.selectedMasterName = null;
  s.flow.slotsPageToken = null;
  s.flow.booking = null;

  try {
    const mastersRes = await gasCall("listMasters", { salonId });
    const masters = mastersRes.masters || mastersRes.items || mastersRes;

    if (!Array.isArray(masters) || masters.length === 0) {
      return ctx.reply(t.no_masters, mainMenuKb(ctx));
    }

    await ctx.replyWithMarkdown(t.choose_master, mastersKb(ctx, masters));
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  }
});

bot.action(/mbranch_mst:(.+)/, async (ctx) => {
  try { await ctx.answerCbQuery(); } catch (_) {}
});

// When master picked in masters branch: show master services
bot.action(/mst:(.+)/, async (ctx, next) => {
  const s = ensureState(ctx);
  if (s.flow?.selectedService) return next();

  const t = L(ctx);
  const salonId = s.flow?.salonId;
  const masterName = decode(ctx.match[1]);

  s.flow.selectedMasterName = masterName;

  try {
    const res = await gasCall("listMasterServices", { salonId, masterName });
    const services = res.services || res.items || res;

    if (!Array.isArray(services) || services.length === 0) {
      await ctx.reply(t.no_services, mainMenuKb(ctx));
      return;
    }

    await ctx.editMessageText(
      t.master_services_title(masterName),
      { parse_mode: "Markdown", reply_markup: masterServicesKb(ctx, services).reply_markup }
    );
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

function masterServicesKb(ctx, services) {
  const t = L(ctx);
  const buttons = [];
  const max = Math.min(30, services.length);

  for (let i = 0; i < max; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < max; j++) {
      const s = services[j];
      const serviceId = String(s.serviceId || s.id || s.key || s.name || `svc_${j}`);
      const title = s.price
        ? `${s.name} — ${s.price} ${s.currency || ""}`.trim()
        : String(s.name || serviceId);

      row.push(Markup.button.callback(title.slice(0, 60), `msvc:${serviceId}`));
    }
    buttons.push(row);
  }

  buttons.push([Markup.button.callback(t.back, "home")]);
  return Markup.inlineKeyboard(buttons);
}

bot.action(/msvc:(.+)/, async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);
  const salonId = s.flow?.salonId;
  const masterName = s.flow?.selectedMasterName;
  const serviceId = ctx.match[1];
  if (!salonId || !masterName) return;

  try {
    const res = await gasCall("listMasterServices", { salonId, masterName });
    const services = res.services || res.items || res;

    const svc = (services || []).find((x) => String(x.serviceId || x.id || x.key || x.name) === String(serviceId))
      || (services || []).find((x) => String(x.name) === String(serviceId));

    if (!svc) return ctx.reply(t.err_generic, mainMenuKb(ctx));

    s.flow.selectedService = {
      serviceId: String(svc.serviceId || svc.id || serviceId),
      name: String(svc.name || ""),
      description: String(svc.description || ""),
      durationMin: Number(svc.durationMin || svc.duration || 60),
      price: Number(svc.price || 0),
      currency: String(svc.currency || ""),
      masterName: masterName,
    };

    const buttons = [];
    buttons.push([Markup.button.callback(t.btn_pick_time, "slots_show")]);
    buttons.push([Markup.button.callback(t.back, "home")]);

    await ctx.editMessageText(
      t.service_details(s.flow.selectedService),
      { parse_mode: "Markdown", reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
    );
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

bot.action("slots_show", async (ctx) => {
  const s = ensureState(ctx);
  s.flow.slotsPageToken = null;
  try {
    await showSlots(ctx, { reset: true });
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

// -------------------- Slots paging --------------------
async function showSlots(ctx, { reset }) {
  const s = ensureState(ctx);
  const t = L(ctx);

  const salonId = s.flow?.salonId;
  const masterName = s.flow?.selectedMasterName;
  const svc = s.flow?.selectedService;

  if (!salonId || !masterName || !svc) {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
    return;
  }

  const durationMin = Number(svc.durationMin || 60);

  const pageToken = reset ? "" : (s.flow.slotsPageToken || "");
  s.flow.lastSlotsRequest = { masterName, durationMin, pageToken };

  const res = await gasCall("computeAvailableSlots", {
    salonId,
    masterName,
    durationMin,
    horizonDays: 7,
    step: 30,
    pageSize: 12,
    pageToken: pageToken || "",
  });

  const slots = res.slots || res.items || [];
  const nextToken = res.nextPageToken || res.nextToken || "";
  const prevToken = res.prevPageToken || res.prevToken || "";

  if (!Array.isArray(slots) || slots.length === 0) {
    const kb = Markup.inlineKeyboard([[Markup.button.callback(t.back, "home")]]);
    try {
      await ctx.editMessageText(t.no_slots, { reply_markup: kb.reply_markup });
    } catch {
      await ctx.reply(t.no_slots, kb);
    }
    return;
  }

  s.flow.slotsPageToken = pageToken || "";

  const text = `${t.choose_time}\n\n👩‍🔧 *${esc(masterName)}*\n💼 *${esc(svc.name)}*`;
  const kb = slotsKb(ctx, slots, { nextToken, prevToken });

  try {
    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb.reply_markup });
  } catch {
    await ctx.replyWithMarkdown(text, kb);
  }
}

function slotsKb(ctx, slots, { nextToken, prevToken }) {
  const t = L(ctx);
  const buttons = [];

  for (let i = 0; i < slots.length; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < slots.length; j++) {
      const sl = slots[j];
      const label = String(sl.label || sl.start || sl.startIso || "");
      const token = String(sl.slotId || sl.startIso || sl.start || label);
      row.push(Markup.button.callback(label.slice(0, 40), `slot:${encode(token)}`));
    }
    buttons.push(row);
  }

  const nav = [];
  if (prevToken) nav.push(Markup.button.callback(t.back, `slots_prev:${encode(prevToken)}`));
  if (nextToken) nav.push(Markup.button.callback(t.next, `slots_next:${encode(nextToken)}`));
  if (nav.length) buttons.push(nav);

  buttons.push([Markup.button.callback(t.home, "home")]);
  return Markup.inlineKeyboard(buttons);
}

bot.action(/slots_next:(.+)/, async (ctx) => {
  const s = ensureState(ctx);
  const token = decode(ctx.match[1]);
  s.flow.slotsPageToken = token;
  try {
    await showSlots(ctx, { reset: false });
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

bot.action(/slots_prev:(.+)/, async (ctx) => {
  const s = ensureState(ctx);
  const token = decode(ctx.match[1]);
  s.flow.slotsPageToken = token;
  try {
    await showSlots(ctx, { reset: false });
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

// -------------------- Create booking + payment menu --------------------
bot.action(/slot:(.+)/, async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);

  const salonId = s.flow?.salonId;
  const masterName = s.flow?.selectedMasterName;
  const svc = s.flow?.selectedService;
  const slotToken = decode(ctx.match[1]);

  if (!salonId || !masterName || !svc) return;

  try {
    const bookingData = {
      clientChatId: String(ctx.chat.id),
      clientUsername: String(ctx.from.username || ""),
      clientName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" "),
      masterName,
      serviceId: svc.serviceId,
      serviceName: svc.name,
      durationMin: Number(svc.durationMin || 60),
      price: Number(svc.price || 0),
      currency: String(svc.currency || ""),
      slotToken,
      createdAt: new Date().toISOString(),
      language: s.lang,
    };

    const res = await gasCall("createBooking", { salonId, bookingData });
    const bookingId = res.bookingId || res.id;
    s.flow.booking = { bookingId };

    await ctx.editMessageText(
      `${t.booking_created}\n\nID: *${esc(String(bookingId))}*`,
      { parse_mode: "Markdown" }
    );

    await showPaymentMenu(ctx);
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

async function showPaymentMenu(ctx) {
  const s = ensureState(ctx);
  const t = L(ctx);

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback(t.pay_online, "pay:online")],
    [Markup.button.callback(t.pay_cash, "pay:cash")],
    [Markup.button.callback(t.home, "home")],
  ]);

  await ctx.replyWithMarkdown(`*${t.pay_title}*`, kb);
}

bot.action(/pay:(online|cash)/, async (ctx) => {
  const s = ensureState(ctx);
  const t = L(ctx);

  const salonId = s.flow?.salonId;
  const bookingId = s.flow?.booking?.bookingId;

  if (!salonId || !bookingId) {
    try { await ctx.answerCbQuery(); } catch (_) {}
    return ctx.reply(t.err_generic, mainMenuKb(ctx));
  }

  try {
    if (ctx.match[1] === "online") {
      const meta = await gasCall("getSalonMeta", { salonId });
      const onlinePaymentUrl =
        meta.onlinePaymentUrl || meta.meta?.onlinePaymentUrl || meta.paymentUrl || meta.meta?.paymentUrl || "";

      if (!onlinePaymentUrl) {
        await ctx.reply("❌ Online payment URL not set in Meta.onlinePaymentUrl");
        return;
      }

      await gasCall("updateBookingPaymentStatus", {
        salonId,
        bookingId,
        payStatus: "WAITING",
        providerTxId: "",
        paidAt: "",
      });

      const link = appendQuery(onlinePaymentUrl, { bookingId: String(bookingId) });

      await ctx.replyWithMarkdown(
        `${t.pay_waiting}\n\n${t.pay_link}\n${link}`,
        Markup.inlineKeyboard([[Markup.button.url(t.pay_online, link)]])
      );
    } else {
      await gasCall("updateBookingPaymentStatus", {
        salonId,
        bookingId,
        payStatus: "NONE",
        providerTxId: "",
        paidAt: "",
      });

      await ctx.replyWithMarkdown(t.pay_none, Markup.inlineKeyboard([
        [Markup.button.callback(t.home, "home")]
      ]));
    }
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

// -------------------- Cancel booking --------------------
bot.action(/cancel:(.+):(.+)/, async (ctx) => {
  const t = L(ctx);
  const bookingId = decode(ctx.match[1]);

  // FIX: normalize salonId decoded from callback
  const salonId = normalizeSalonId(decode(ctx.match[2]));

  try {
    await gasCall("cancelBooking", {
      salonId,
      bookingId,
      cancelBy: "CLIENT",
    });

    await ctx.reply(t.cancelled_ok, mainMenuKb(ctx));
  } catch {
    await ctx.reply(t.err_generic, mainMenuKb(ctx));
  } finally {
    try { await ctx.answerCbQuery(); } catch (_) {}
  }
});

// -------------------- Fallback text handler --------------------
bot.on("text", async (ctx) => {
  const t = L(ctx);
  await ctx.reply(t.pick_action, mainMenuKb(ctx));
});

// -------------------- Payment webhook (universal) --------------------
app.post(PAY_WEBHOOK_PATH, async (req, res) => {
  try {
    const { salonId, bookingId, status, providerTxId, paidAt } = req.body || {};

    if (!salonId || !bookingId) {
      res.status(400).json({ ok: false, error: "Missing salonId or bookingId" });
      return;
    }

    // FIX: normalize salonId from webhook payload
    const sid = normalizeSalonId(String(salonId));

    const payStatus = String(status || "PAID").toUpperCase();
    const paidAtIso = paidAt ? String(paidAt) : new Date().toISOString();

    await gasCall("updateBookingPaymentStatus", {
      salonId: sid,
      bookingId: String(bookingId),
      payStatus,
      providerTxId: providerTxId ? String(providerTxId) : "",
      paidAt: paidAtIso,
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// -------------------- Telegram webhook + start server --------------------
app.use(bot.webhookCallback(WEBHOOK_PATH));

(async () => {
  await bot.telegram.setWebhook(`${PUBLIC_URL}${WEBHOOK_PATH}`);
  app.listen(PORT, () => console.log(`OK: ${PORT}`));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// -------------------- utils --------------------
function str(name, fallback = "") {
  const v = process.env[name];
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
}
function mustStr(name) {
  const v = str(name, "");
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
function esc(s) {
  return String(s || "").replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
function encode(s) {
  return Buffer.from(String(s), "utf8").toString("base64url");
}
function decode(s) {
  return Buffer.from(String(s), "base64url").toString("utf8");
}
function appendQuery(url, params) {
  const u = new URL(url);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  return u.toString();
}
