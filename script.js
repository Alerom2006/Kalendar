const widgetInstanceId = Date.now();
let accessToken = null;

async function init() {
  console.log(
    `[${widgetInstanceId}] Виджет "Календарь заказов" инициализирован`
  );

  if (typeof window.AmoCRM === "undefined") {
    console.error(`[${widgetInstanceId}] AmoCRM API не найдено.`);
    return;
  }

  const targetElementId = "widget_container";

  // Функция для получения Access Token из настроек виджета (или localStorage)
  async function getAccessToken() {
    const settings = await window.AmoCRM.widgets.system(widgetInstanceId);
    return (
      settings.access_token ||
      localStorage.getItem(`amo_access_token_${widgetInstanceId}`) ||
      null
    );
  }

  async function renderWidget() {
    const widgetContainer = document.getElementById(targetElementId);
    if (!widgetContainer) {
      console.error(
        `[${widgetInstanceId}] Не найден элемент для встраивания виджета.`
      );
      return;
    }

    widgetContainer.innerHTML = `
            <div class="container">
                <h1>Календарь заказов (amoCRM)</h1>
                <div id="calendar-container">
                    <div id="calendar-header" class="mb-3">
                        <button id="prevMonth" class="btn btn-secondary me-2">&lt; Предыдущий</button>
                        <h2 id="currentMonthYear"></h2>
                        <button id="nextMonth" class="btn btn-secondary ms-2">Следующий &gt;</button>
                    </div>
                    <div id="calendar"></div>
                </div>

                <div id="deal-list">
                    <h2>Сделки на выбранную дату</h2>
                    <ul id="deals"></ul>
                </div>
                <div id="auth-section" class="mt-3" style="display: ${
                  accessToken ? "none" : "block"
                };">
                  <button id="authButton" class="btn btn-primary">Авторизоваться</button>
                </div>
            </div>
        `;

    const calendarEl = document.getElementById("calendar");
    const currentMonthYearEl = document.getElementById("currentMonthYear");
    const prevMonthButton = document.getElementById("prevMonth");
    const nextMonthButton = document.getElementById("nextMonth");
    const dealsEl = document.getElementById("deals");
    const authButton = document.getElementById("authButton");

    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();

    const API_URL = "https://aaar31733.amocrm.ru/api/v4/";
    const DEAL_DATE_FIELD_ID = 808381; // ID поля "Заказ на...", указан!
    const LEAD_STATUS_ID = 142; // ID статуса сделки
    const DELIVERY_RANGE_FIELD_ID = 808385;
    const EXACT_TIME_FIELD_ID = 808387;
    const ADDRESS_FIELD_ID = 808389;

    async function fetchDeals(year, month) {
      if (!accessToken) {
        console.warn(
          `[${widgetInstanceId}] Нет Access Token, пропуск запроса к API.`
        );
        return {};
      }
      const startDate = new Date(year, month, 1).toISOString().slice(0, 10);
      const endDate = new Date(year, month + 1, 0).toISOString().slice(0, 10);
      let dealsByDate = {};

      try {
        const response = await fetch(
          `${API_URL}leads?filter[date_modified][from]=${startDate}&filter[date_modified][to]=${endDate}`,
          {
            // Удалена фильтрация по статусу
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            // Unauthorized - токен истек
            console.warn(
              `[${widgetInstanceId}] Access Token истек, попытка обновить`
            );
            await refreshToken();
            return await fetchDeals(year, month); // Повторяем запрос после обновления
          }
          throw new Error(`Ошибка API: ${response.status}`);
        }

        const data = await response.json();
        dealsByDate = processDeals(data._embedded.leads);
      } catch (error) {
        console.error("Ошибка при получении сделок:", error);
        alert("Ошибка при получении сделок. Проверьте консоль.");
        return {};
      }
      return dealsByDate;
    }

    function processDeals(deals) {
      const groupedDeals = {};
      deals.forEach((deal) => {
        let dealDate;

        // Получаем дату из кастомного поля "Заказ на..."
        if (deal.custom_fields_values) {
          const orderDateField = deal.custom_fields_values.find(
            (field) => field.field_id == DEAL_DATE_FIELD_ID
          );
          if (
            orderDateField &&
            orderDateField.values &&
            orderDateField.values.length > 0
          ) {
            dealDate = orderDateField.values[0].value.slice(0, 10);
          } else {
            dealDate = new Date(deal.created_at * 1000)
              .toISOString()
              .slice(0, 10); // Если нет "Заказ на...", используем дату создания
          }
        } else {
          dealDate = new Date(deal.created_at * 1000)
            .toISOString()
            .slice(0, 10); //  Если нет кастомных полей, используем дату создания
        }

        if (!groupedDeals[dealDate]) {
          groupedDeals[dealDate] = [];
        }
        groupedDeals[dealDate].push(deal);
      });
      return groupedDeals;
    }

    async function renderCalendar() {
      if (!accessToken) {
        calendarEl.innerHTML = "Для работы виджета необходимо авторизоваться.";
        return;
      }
      const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
      let dayOfWeek = firstDayOfMonth.getDay();
      if (dayOfWeek === 0) {
        dayOfWeek = 6;
      } else {
        dayOfWeek = dayOfWeek - 1;
      }

      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const monthNames = [
        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь",
      ];

      calendarEl.innerHTML = "";
      currentMonthYearEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;

      const daysOfWeek = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
      daysOfWeek.forEach((day) => {
        const weekdayEl = document.createElement("div");
        weekdayEl.classList.add("weekday");
        weekdayEl.textContent = day;
        calendarEl.appendChild(weekdayEl);
      });

      for (let i = 0; i < dayOfWeek; i++) {
        const emptyDayEl = document.createElement("div");
        emptyDayEl.classList.add("calendar-day", "empty");
        calendarEl.appendChild(emptyDayEl);
      }

      const dealsByDate = await fetchDeals(currentYear, currentMonth);

      for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement("div");
        dayEl.classList.add("calendar-day");
        dayEl.textContent = day;

        const currentDate = `${currentYear}-${String(currentMonth + 1).padStart(
          2,
          "0"
        )}-${String(day).padStart(2, "0")}`;

        if (dealsByDate[currentDate]) {
          dayEl.classList.add("has-deals");
          dayEl.dataset.dealCount = dealsByDate[currentDate].length;
        }

        dayEl.addEventListener("click", () => {
          showDealsForDate(currentDate, dealsByDate[currentDate] || []);
        });
        calendarEl.appendChild(dayEl);
      }
    }

    function showDealsForDate(date, deals) {
      dealsEl.innerHTML = "";

      if (!deals || deals.length === 0) {
        dealsEl.textContent = "На эту дату сделок нет.";
        return;
      }

      deals.forEach((deal) => {
        const dealEl = document.createElement("li");

        const idEl = document.createElement("div");
        idEl.classList.add("deal-info");
        idEl.textContent = `ID: ${deal.id}`;
        dealEl.appendChild(idEl);

        const nameEl = document.createElement("div");
        nameEl.classList.add("deal-info");
        nameEl.textContent = `Название: ${deal.name}`;
        dealEl.appendChild(nameEl);

        const priceEl = document.createElement("div");
        priceEl.classList.add("deal-info");
        priceEl.textContent = `Бюджет: ${deal.price}`;
        dealEl.appendChild(priceEl);

        const deliveryRangeEl = document.createElement("div");
        deliveryRangeEl.classList.add("deal-info");
        deliveryRangeEl.textContent = `Диапазон доставки: ${
          getCustomFieldValue(deal, DELIVERY_RANGE_FIELD_ID) || "Не указано"
        }`;
        dealEl.appendChild(deliveryRangeEl);

        const exactTimeEl = document.createElement("div");
        exactTimeEl.classList.add("deal-info");
        exactTimeEl.textContent = `К точному времени: ${
          getCustomFieldValue(deal, EXACT_TIME_FIELD_ID) || "Не указано"
        }`;
        dealEl.appendChild(exactTimeEl);

        const addressEl = document.createElement("div");
        addressEl.classList.add("deal-info");
        addressEl.textContent = `Адрес: ${
          getCustomFieldValue(deal, ADDRESS_FIELD_ID) || "Не указано"
        }`;
        dealEl.appendChild(addressEl);

        dealEl.addEventListener("click", () => {
          window.AmoCRM.openCard("lead", deal.id);
        });

        dealsEl.appendChild(dealEl);
      });
    }

    function getCustomFieldValue(deal, fieldId) {
      if (!deal.custom_fields_values) {
        return null;
      }
      const field = deal.custom_fields_values.find(
        (f) => f.field_id == fieldId
      );
      return field && field.values && field.values.length > 0
        ? field.values[0].value
        : null;
    }

    prevMonthButton.addEventListener("click", async () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      await renderCalendar();
    });

    nextMonthButton.addEventListener("click", async () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      await renderCalendar();
    });

    authButton.addEventListener("click", () => {
      window.location.href = `https://aaar31733.amocrm.ru/oauth2/authorize?client_id=Нужно заполнить!!!&redirect_uri=https://alerom2006.github.io/Kalendar/oauth_callback.html&response_type=code&state=${widgetInstanceId}`;
    });

    async function refreshToken() {
      try {
        const settings = await window.AmoCRM.widgets.system(widgetInstanceId);
        const refreshToken = settings.refresh_token;
        if (!refreshToken) {
          console.error(`[${widgetInstanceId}] Нет Refresh Token.`);
          return;
        }

        const tokenResponse = await fetch(
          "https://aaar31733.amocrm.ru/oauth2/access_token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_id: "Нужно заполнить!!!",
              client_secret: "Нужно заполнить!!!",
              grant_type: "refresh_token",
              refresh_token: refreshToken,
              redirect_uri:
                "https://alerom2006.github.io/Kalendar/oauth_callback.html",
            }),
          }
        );

        if (!tokenResponse.ok) {
          throw new Error(`Ошибка обновления токена: ${tokenResponse.status}`);
        }
        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token;
        localStorage.setItem(
          `amo_access_token_${widgetInstanceId}`,
          accessToken
        );
      } catch (error) {
        console.error("[Refresh Token Error]", error);
        alert("Ошибка при обновлении токена. Пожалуйста, переавторизуйтесь.");
      }
    }

    clientId = "Нужно заполнить!!!";
    clientSecret = "Нужно заполнить!!!";
    redirectUri = "https://alerom2006.github.io/Kalendar/oauth_callback.html";

    accessToken = await getAccessToken();

    if (accessToken) {
      await renderCalendar();
    }
  }

  renderWidget();
}

if (typeof window.AmoCRM !== "undefined") {
  window.AmoCRM.onReady(() => {
    console.log(`[${widgetInstanceId}] AmoCRM onReady`);
    init();
  });
} else {
  console.error(
    `[${widgetInstanceId}] AmoCRM API не найдено до инициализации.`
  );
}
