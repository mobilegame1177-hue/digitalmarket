// ==================== ИНИЦИАЛИЗАЦИЯ SUPABASE ====================
// 🔥 ЗАМЕНИТЕ НА ВАШИ ДАННЫЕ ИЗ ПРОЕКТА SUPABASE
const SUPABASE_URL = 'https://digitalmarket.supabase.co';
const SUPABASE_ANON_KEY = 'cnsstmlhbeckboteflta';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Глобальные переменные
let currentUser = null;      // { id, email, name, role, balance }
let pendingPurchase = null;
let currentCatalogCategory = 'all';
window.products = [];

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function showNeonNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `neon-notification ${type}`;
    notification.innerHTML = `<div class="neon-notification-content"><span class="neon-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : '🔔'}</span><span>${message}</span></div>`;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => { notification.classList.remove('show'); setTimeout(() => notification.remove(), 300); }, 3000);
}

function applyNeonTheme() {
    if (!document.body.classList.contains('neon-theme')) document.body.classList.add('neon-theme');
}

function updateAdminLink() {
    const link = document.getElementById('adminLink');
    if (link) link.style.display = (currentUser && currentUser.role === 'admin') ? 'inline-block' : 'none';
}

function isImageData(str) {
    return str && (str.startsWith('data:image') || str.startsWith('http'));
}

// ==================== ЗАГРУЗКА ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ====================
async function loadCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('name, role, balance, blocked')
            .eq('id', user.id)
            .single();
        if (profile && !profile.blocked) {
            currentUser = {
                id: user.id,
                email: user.email,
                name: profile.name,
                role: profile.role,
                balance: profile.balance
            };
            localStorage.setItem('digitalmarket_current_user', JSON.stringify(currentUser));
        } else if (profile && profile.blocked) {
            await supabase.auth.signOut();
            currentUser = null;
            localStorage.removeItem('digitalmarket_current_user');
            showNeonNotification('Ваш аккаунт заблокирован', 'error');
        } else {
            currentUser = null;
        }
    } else {
        currentUser = null;
        localStorage.removeItem('digitalmarket_current_user');
    }
    updateAuthUI();
    updateBalanceUI();
    updateAdminLink();
    updateSidebarContent();
    // Перерисовка страниц
    if (window.location.pathname.includes('purchases.html')) renderUserOrders();
    if (window.location.pathname.includes('my-tickets.html')) renderUserTickets();
    if (window.location.pathname.includes('catalog.html')) renderCatalog(currentCatalogCategory);
    if (window.location.pathname.includes('admin.html') && currentUser && currentUser.role === 'admin') {
        renderAdminUsers();
        renderAdminOrders();
        renderAdminTickets();
        renderAdminTopupRequests();
        renderAdminProducts();
    }
}

async function updateBalanceUI() {
    const balanceSpan = document.getElementById('userBalance');
    if (balanceSpan && currentUser) {
        const { data } = await supabase.from('profiles').select('balance').eq('id', currentUser.id).single();
        balanceSpan.textContent = `${data?.balance || 0} руб.`;
        const sidebarBalance = document.getElementById('sidebarUserBalance');
        if (sidebarBalance) sidebarBalance.textContent = `Баланс: ${data?.balance || 0} руб.`;
    }
}

async function getUserBalance() {
    if (!currentUser) return 0;
    const { data } = await supabase.from('profiles').select('balance').eq('id', currentUser.id).single();
    return data?.balance || 0;
}

async function setUserBalance(newBalance) {
    if (!currentUser) return false;
    const { error } = await supabase.from('profiles').update({ balance: newBalance }).eq('id', currentUser.id);
    if (!error) {
        updateBalanceUI();
        return true;
    }
    return false;
}

// ==================== АВТОРИЗАЦИЯ ====================
async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        showNeonNotification('Неверный email или пароль', 'error');
        return false;
    }
    await loadCurrentUser();
    showNeonNotification(`Добро пожаловать, ${currentUser.name}!`, 'success');
    closeModal('authModal');
    if (pendingPurchase) {
        performPurchase(pendingPurchase);
        pendingPurchase = null;
    }
    return true;
}

async function register(name, email, password) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } }
    });
    if (error) {
        if (error.message.includes('already registered')) {
            showNeonNotification('Пользователь с таким email уже существует', 'error');
        } else {
            showNeonNotification('Ошибка регистрации', 'error');
        }
        return false;
    }
    showNeonNotification(`Регистрация прошла успешно! Добро пожаловать, ${name}!`, 'success');
    closeModal('authModal');
    await loadCurrentUser();
    if (pendingPurchase) {
        performPurchase(pendingPurchase);
        pendingPurchase = null;
    }
    return true;
}

async function logout() {
    await supabase.auth.signOut();
    currentUser = null;
    localStorage.removeItem('digitalmarket_current_user');
    updateAuthUI();
    updateAdminLink();
    updateSidebarContent();
    showNeonNotification('Вы вышли из аккаунта', 'info');
    if (window.location.pathname.includes('purchases.html') || window.location.pathname.includes('my-tickets.html') || window.location.pathname.includes('admin.html')) {
        window.location.href = 'index.html';
    }
}

// ==================== ТОВАРЫ ====================
async function loadProducts() {
    const { data, error } = await supabase.from('products').select('*').order('id', { ascending: false });
    if (!error && data && data.length > 0) {
        window.products = data;
    } else {
        // Добавляем стартовые товары
        const defaultProducts = [
            { name: "Dragon Slayer Скин", price: 1490, price_str: "1490 руб.", description: "Эксклюзивный скин для меча.", image: "🐉", category: "Анимации" },
            { name: "Cyberpunk 2077 Ключ", price: 2299, price_str: "2299 руб.", description: "Лицензионный ключ GOG.", image: "🔑", category: "Игрушки" },
            { name: "Premium Аккаунт", price: 899, price_str: "899 руб.", description: "30 дней премиум-статуса.", image: "👑", category: "Комнаты" },
            { name: "5000 монет", price: 499, price_str: "499 руб.", description: "Игровая валюта.", image: "💰", category: "Игрушки" },
            { name: "Гайд Мастер-класс", price: 750, price_str: "750 руб.", description: "Видео-гайд.", image: "📘", category: "Анимации" },
            { name: "Сезонный пропуск", price: 1199, price_str: "1199 руб.", description: "Эксклюзивные награды.", image: "🎫", category: "Комнаты" }
        ];
        for (const p of defaultProducts) {
            await supabase.from('products').insert(p);
        }
        const { data: newData } = await supabase.from('products').select('*').order('id', { ascending: false });
        window.products = newData;
    }
    rebuildCarousel();
    if (window.location.pathname.includes('catalog.html')) renderCatalog(currentCatalogCategory);
    if (document.getElementById('adminProductsList')) renderAdminProducts();
}

async function addProduct(name, priceNum, desc, imageData, category) {
    if (!currentUser || currentUser.role !== 'admin') {
        showNeonNotification('Только администратор может добавлять товары', 'error');
        return;
    }
    const { error } = await supabase.from('products').insert({
        name, price: priceNum, price_str: `${priceNum} руб.`, description: desc, image: imageData, category
    });
    if (!error) {
        showNeonNotification(`Товар "${name}" добавлен!`, 'success');
        loadProducts();
    } else {
        showNeonNotification('Ошибка добавления товара', 'error');
    }
}

async function deleteProduct(productId) {
    if (!currentUser || currentUser.role !== 'admin') {
        showNeonNotification('Только администратор может удалять товары', 'error');
        return;
    }
    if (!confirm('Удалить товар?')) return;
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (!error) {
        showNeonNotification('Товар удалён', 'success');
        loadProducts();
    } else {
        showNeonNotification('Ошибка удаления', 'error');
    }
}

function rebuildCarousel() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    track.innerHTML = '';
    window.products.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'product-card';
        const iconHtml = isImageData(prod.image) ? `<img src="${prod.image}" style="width:100%;height:130px;object-fit:cover;border-radius:1rem;">` : `<div class="product-img" style="font-size:3rem;">${prod.image}</div>`;
        card.innerHTML = `${iconHtml}<h4>${prod.name}</h4><div class="product-price">${prod.price_str}</div>`;
        card.addEventListener('click', () => showProductDetail(prod));
        track.appendChild(card);
    });
}

function renderCatalog(category) {
    const container = document.getElementById('catalogGrid');
    if (!container) return;
    let filtered = window.products;
    if (category !== 'all') filtered = window.products.filter(p => p.category === category);
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-msg">Нет товаров в этой категории.</div>';
        return;
    }
    container.innerHTML = filtered.map(prod => `
        <div class="catalog-item" data-id="${prod.id}">
            <div class="catalog-img">
                ${isImageData(prod.image) ? `<img src="${prod.image}" alt="${prod.name}">` : `<span>${prod.image}</span>`}
            </div>
            <h3>${prod.name}</h3>
            <div class="catalog-price">${prod.price_str}</div>
            <div class="catalog-category">${prod.category}</div>
            <p>${prod.description.substring(0, 60)}...</p>
            <button class="buy-catalog-btn" data-id="${prod.id}">Купить</button>
        </div>
    `).join('');
    document.querySelectorAll('.catalog-item').forEach(item => {
        const id = parseInt(item.dataset.id);
        const product = window.products.find(p => p.id == id);
        if (product) item.addEventListener('click', (e) => { if (!e.target.classList.contains('buy-catalog-btn')) showProductDetail(product); });
    });
    document.querySelectorAll('.buy-catalog-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); const id = parseInt(btn.dataset.id); const product = window.products.find(p => p.id == id); if (product) attemptPurchase(product); });
    });
}

function showProductDetail(product) {
    const iconHtml = isImageData(product.image) ? `<img src="${product.image}" style="width:100px;height:100px;object-fit:cover;border-radius:1rem;margin:0 auto;display:block;">` : `<div style="font-size:4rem;text-align:center;">${product.image}</div>`;
    document.getElementById('productDetailIcon').innerHTML = iconHtml;
    document.getElementById('productDetailName').innerText = product.name;
    document.getElementById('productDetailDesc').innerText = product.description;
    document.getElementById('productDetailPrice').innerHTML = product.price_str;
    const buyBtn = document.getElementById('productDetailBuyBtn');
    const newBtn = buyBtn.cloneNode(true);
    buyBtn.parentNode.replaceChild(newBtn, buyBtn);
    newBtn.addEventListener('click', () => attemptPurchase(product));
    showModal('productModal');
}

// ==================== ПОКУПКИ И ЗАКАЗЫ ====================
async function attemptPurchase(product) {
    if (!currentUser) {
        pendingPurchase = product;
        showModal('authModal', 'login');
        showNeonNotification('Для покупки войдите или зарегистрируйтесь.', 'info');
        return;
    }
    await performPurchase(product);
}

async function performPurchase(product) {
    const balance = await getUserBalance();
    if (balance >= product.price) {
        const newBalance = balance - product.price;
        await supabase.from('profiles').update({ balance: newBalance }).eq('id', currentUser.id);
        const { error } = await supabase.from('orders').insert({
            product_id: product.id,
            product_name: product.name,
            product_price: product.price_str,
            product_price_num: product.price,
            user_id: currentUser.id,
            user_email: currentUser.email,
            status: 'pending',
            order_date: new Date().toISOString()
        });
        if (!error) {
            showNeonNotification(`✅ Заказ на "${product.name}" создан!`, 'success');
            if (window.location.pathname.includes('purchases.html')) renderUserOrders();
        } else {
            showNeonNotification('Ошибка создания заказа', 'error');
            await supabase.from('profiles').update({ balance: balance }).eq('id', currentUser.id);
        }
    } else {
        showNeonNotification(`❌ Недостаточно средств! Не хватает ${product.price - balance} руб.`, 'error');
        showTopupModal();
    }
}

async function renderUserOrders() {
    const container = document.getElementById('purchasesContainer');
    if (!container) return;
    if (!currentUser) {
        container.innerHTML = '<div class="empty-msg">🔒 <a href="#" id="loginToSeePurchases">Войдите</a> чтобы увидеть заказы.</div>';
        const link = document.getElementById('loginToSeePurchases');
        if (link) link.addEventListener('click', (e) => { e.preventDefault(); showModal('authModal', 'login'); });
        return;
    }
    const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('order_date', { ascending: false });
    if (error || !orders || orders.length === 0) {
        container.innerHTML = '<div class="empty-msg">У вас пока нет заказов.</div>';
        return;
    }
    container.innerHTML = orders.map(order => `
        <div class="order-card">
            <div><strong>${order.product_name}</strong> — ${order.product_price}<br><small>${new Date(order.order_date).toLocaleString()}</small><br>
            <span class="order-status ${order.status}">${order.status === 'pending' ? '⏳ Ожидает выдачи' : '✅ Выдан'}</span>
            ${order.status === 'delivered' && order.key ? `<br><strong>🔑 Ключ:</strong> ${order.key}` : ''}
            </div>
            ${order.status === 'pending' ? `<button class="chat-with-admin-btn" data-order-id="${order.id}">💬 Чат</button>` : ''}
        </div>
    `).join('');
    document.querySelectorAll('.chat-with-admin-btn').forEach(btn => {
        btn.addEventListener('click', () => openUserChat(btn.dataset.orderId));
    });
}

// Чат по заказу (пользователь)
async function openUserChat(orderId) {
    const { data: messages } = await supabase
        .from('order_chats')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
    // Создаём/показываем модалку чата
    let modal = document.getElementById('chatModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'chatModal';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content chat-modal-content"><span class="close-modal">&times;</span><h3>Чат по заказу: <span id="chatProductName"></span></h3><div id="chatMessages" class="chat-messages"></div><textarea id="chatMessageText" rows="2" placeholder="Сообщение..."></textarea><button id="sendChatMessageBtn">Отправить</button></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => closeModal('chatModal');
        window.onclick = (e) => { if (e.target === modal) closeModal('chatModal'); };
    }
    document.getElementById('chatProductName').innerText = `#${orderId}`;
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    (messages || []).forEach(msg => {
        const div = document.createElement('div');
        div.className = `chat-message ${msg.sender}`;
        div.innerHTML = `<strong>${msg.sender === 'user' ? 'Вы' : 'Админ'}:</strong> ${msg.message}<br><small>${new Date(msg.created_at).toLocaleString()}</small>`;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
    const sendBtn = document.getElementById('sendChatMessageBtn');
    const newBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newBtn, sendBtn);
    newBtn.onclick = async () => {
        const text = document.getElementById('chatMessageText').value.trim();
        if (!text) return;
        await supabase.from('order_chats').insert({
            order_id: orderId,
            sender: 'user',
            message: text,
            created_at: new Date().toISOString()
        });
        document.getElementById('chatMessageText').value = '';
        openUserChat(orderId); // обновить чат
        showNeonNotification('Сообщение отправлено', 'info');
    };
    showModal('chatModal');
}

// ==================== ТИКЕТЫ ПОДДЕРЖКИ ====================
async function renderUserTickets() {
    const container = document.getElementById('userTicketsContainer');
    if (!container) return;
    if (!currentUser) {
        container.innerHTML = '<div class="empty-msg">🔒 <a href="#" id="loginToSeeTickets">Войдите</a> чтобы увидеть обращения.</div>';
        const link = document.getElementById('loginToSeeTickets');
        if (link) link.addEventListener('click', (e) => { e.preventDefault(); showModal('authModal', 'login'); });
        return;
    }
    const { data: tickets } = await supabase
        .from('tickets')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
    if (!tickets || tickets.length === 0) {
        container.innerHTML = '<div class="empty-msg">У вас пока нет обращений. <a href="support.html">Создать обращение</a></div>';
        return;
    }
    container.innerHTML = tickets.map(ticket => `
        <div class="ticket-modern-card">
            <div class="ticket-modern-header">
                <div class="ticket-modern-id">#${ticket.id}</div>
                <div class="ticket-modern-status ${ticket.status}">${ticket.status === 'open' ? 'Открыт' : 'Закрыт'}</div>
            </div>
            <div class="ticket-modern-body">
                <div class="ticket-modern-info">
                    <div class="ticket-modern-date">📅 Создан: <strong>${new Date(ticket.created_at).toLocaleString()}</strong></div>
                    ${ticket.closed_at ? `<div class="ticket-modern-date">🔒 Закрыт: <strong>${new Date(ticket.closed_at).toLocaleString()}</strong></div>` : ''}
                </div>
                <div class="ticket-modern-action">
                    <button class="ticket-chat-btn" data-ticket-id="${ticket.id}">💬 Открыть чат</button>
                </div>
            </div>
        </div>
    `).join('');
    document.querySelectorAll('.ticket-chat-btn').forEach(btn => {
        btn.addEventListener('click', () => openUserTicketChat(btn.dataset.ticketId));
    });
}

async function openUserTicketChat(ticketId) {
    const { data: messages } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
    let modal = document.getElementById('userTicketChatModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'userTicketChatModal';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content chat-modal-content"><span class="close-modal">&times;</span><h3>Чат по обращению #<span id="userTicketId"></span></h3><div id="userTicketChatMessages" class="chat-messages"></div><textarea id="userTicketMessageText" rows="2" placeholder="Ваше сообщение..."></textarea><button id="userTicketSendBtn">Отправить</button><div id="userTicketClosedWarning" style="color:#ff3366;margin-top:0.5rem;display:none;">⚠️ Тикет закрыт, отправка сообщений недоступна.</div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => closeModal('userTicketChatModal');
        window.onclick = (e) => { if (e.target === modal) closeModal('userTicketChatModal'); };
    }
    document.getElementById('userTicketId').innerText = ticketId;
    const container = document.getElementById('userTicketChatMessages');
    container.innerHTML = '';
    (messages || []).forEach(msg => {
        const div = document.createElement('div');
        div.className = `chat-message ${msg.sender}`;
        div.innerHTML = `<strong>${msg.sender === 'user' ? 'Вы' : 'Администратор'}:</strong> ${msg.message}<br><small>${new Date(msg.created_at).toLocaleString()}</small>`;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
    const sendBtn = document.getElementById('userTicketSendBtn');
    const newBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newBtn, sendBtn);
    const warningDiv = document.getElementById('userTicketClosedWarning');
    if (ticket.status === 'closed') {
        newBtn.disabled = true;
        warningDiv.style.display = 'block';
    } else {
        newBtn.disabled = false;
        warningDiv.style.display = 'none';
    }
    newBtn.onclick = async () => {
        const text = document.getElementById('userTicketMessageText').value.trim();
        if (!text) return;
        await supabase.from('ticket_messages').insert({
            ticket_id: ticketId,
            sender: 'user',
            message: text,
            created_at: new Date().toISOString()
        });
        document.getElementById('userTicketMessageText').value = '';
        openUserTicketChat(ticketId);
        showNeonNotification('Сообщение отправлено', 'info');
    };
    showModal('userTicketChatModal');
}

// ==================== ЗАЯВКИ НА ПОПОЛНЕНИЕ ====================
async function createTopupRequest(amount) {
    if (!currentUser) return;
    const { error } = await supabase.from('topup_requests').insert({
        user_id: currentUser.id,
        user_email: currentUser.email,
        amount: amount,
        status: 'pending',
        created_at: new Date().toISOString()
    });
    if (!error) {
        showNeonNotification(`Заявка на пополнение ${amount} руб. создана. Ожидайте подтверждения.`, 'success');
    } else {
        showNeonNotification('Ошибка создания заявки', 'error');
    }
}

// ==================== АДМИН-ПАНЕЛЬ ====================
async function renderAdminUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;
    const { data: users } = await supabase.from('profiles').select('*');
    tbody.innerHTML = '';
    for (const user of users) {
        if (user.role === 'admin') continue;
        const row = tbody.insertRow();
        row.insertCell(0).textContent = user.name;
        row.insertCell(1).textContent = user.email;
        row.insertCell(2).textContent = `${user.balance} руб.`;
        row.insertCell(3).textContent = user.blocked ? '🔴 Заблокирован' : '🟢 Активен';
        const actionsCell = row.insertCell(4);
        const blockBtn = document.createElement('button');
        blockBtn.textContent = user.blocked ? 'Разблокировать' : 'Заблокировать';
        blockBtn.className = 'admin-user-block-btn';
        blockBtn.addEventListener('click', async () => {
            await supabase.from('profiles').update({ blocked: !user.blocked }).eq('id', user.id);
            renderAdminUsers();
            showNeonNotification(`Пользователь ${user.email} ${!user.blocked ? 'заблокирован' : 'разблокирован'}`, 'info');
        });
        actionsCell.appendChild(blockBtn);
        const editBalanceBtn = document.createElement('button');
        editBalanceBtn.textContent = '💰 Изменить баланс';
        editBalanceBtn.addEventListener('click', () => showAdminEditBalanceModal(user));
        actionsCell.appendChild(editBalanceBtn);
    }
}

async function showAdminEditBalanceModal(user) {
    const newBalance = prompt(`Введите новый баланс для ${user.name}:`, user.balance);
    if (newBalance !== null && !isNaN(parseInt(newBalance))) {
        await supabase.from('profiles').update({ balance: parseInt(newBalance) }).eq('id', user.id);
        renderAdminUsers();
        showNeonNotification(`Баланс пользователя ${user.email} изменён на ${newBalance} руб.`, 'success');
        if (currentUser && currentUser.id === user.id) updateBalanceUI();
    }
}

async function renderAdminOrders() {
    const container = document.getElementById('adminOrdersContainer');
    if (!container) return;
    const { data: orders } = await supabase.from('orders').select('*').order('order_date', { ascending: false });
    const pendingOrders = (orders || []).filter(o => o.status === 'pending');
    if (pendingOrders.length === 0) {
        container.innerHTML = '<div class="empty-msg">Нет ожидающих заказов</div>';
        return;
    }
    container.innerHTML = pendingOrders.map(order => `
        <div class="admin-order-card">
            <div><strong>${order.product_name}</strong> — ${order.product_price}</div>
            <div>Пользователь: ${order.user_email}</div>
            <div>Дата: ${new Date(order.order_date).toLocaleString()}</div>
            <button class="admin-chat-btn" data-order-id="${order.id}">💬 Чат и выдача</button>
        </div>
    `).join('');
    document.querySelectorAll('.admin-chat-btn').forEach(btn => {
        btn.addEventListener('click', () => openAdminChat(btn.dataset.orderId));
    });
}

async function openAdminChat(orderId) {
    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
    const { data: messages } = await supabase.from('order_chats').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
    let modal = document.getElementById('adminChatModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'adminChatModal';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content chat-modal-content"><span class="close-modal">&times;</span><h3>Чат с <span id="adminChatUser"></span> по заказу <span id="adminChatProduct"></span></h3><div id="adminChatMessages" class="chat-messages"></div><input type="text" id="adminKeyInput" placeholder="Ключ/ссылка для выдачи"><textarea id="adminChatMessageText" rows="2" placeholder="Сообщение..."></textarea><button id="adminSendMessageBtn">Отправить сообщение</button><button id="adminDeliverBtn" class="deliver-btn">✅ Выдать товар</button></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => closeModal('adminChatModal');
        window.onclick = (e) => { if (e.target === modal) closeModal('adminChatModal'); };
    }
    document.getElementById('adminChatUser').innerText = order.user_email;
    document.getElementById('adminChatProduct').innerText = order.product_name;
    const container = document.getElementById('adminChatMessages');
    container.innerHTML = '';
    (messages || []).forEach(msg => {
        const div = document.createElement('div');
        div.className = `chat-message ${msg.sender}`;
        div.innerHTML = `<strong>${msg.sender === 'user' ? 'Пользователь' : 'Вы'}:</strong> ${msg.message}<br><small>${new Date(msg.created_at).toLocaleString()}</small>`;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
    const sendBtn = document.getElementById('adminSendMessageBtn');
    const newSend = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSend, sendBtn);
    newSend.onclick = async () => {
        const text = document.getElementById('adminChatMessageText').value.trim();
        if (!text) return;
        await supabase.from('order_chats').insert({
            order_id: orderId,
            sender: 'admin',
            message: text,
            created_at: new Date().toISOString()
        });
        document.getElementById('adminChatMessageText').value = '';
        openAdminChat(orderId);
        showNeonNotification('Сообщение отправлено', 'info');
    };
    const deliverBtn = document.getElementById('adminDeliverBtn');
    const newDeliver = deliverBtn.cloneNode(true);
    deliverBtn.parentNode.replaceChild(newDeliver, deliverBtn);
    newDeliver.onclick = async () => {
        const key = document.getElementById('adminKeyInput').value.trim();
        if (!key) { showNeonNotification('Введите ключ', 'error'); return; }
        await supabase.from('orders').update({ status: 'delivered', key: key }).eq('id', orderId);
        showNeonNotification('Товар выдан!', 'success');
        closeModal('adminChatModal');
        renderAdminOrders();
        if (window.location.pathname.includes('purchases.html')) renderUserOrders();
    };
    showModal('adminChatModal');
}

async function renderAdminTickets() {
    const container = document.getElementById('adminTicketsContainer');
    if (!container) return;
    const { data: tickets } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
    if (!tickets || tickets.length === 0) {
        container.innerHTML = '<div class="empty-msg">Нет обращений</div>';
        return;
    }
    container.innerHTML = tickets.map(ticket => `
        <div class="admin-ticket-card">
            <div><strong>#${ticket.id}</strong> от ${ticket.user_name || 'пользователь'} (${ticket.user_email})</div>
            <div>Статус: ${ticket.status === 'open' ? '🟢 Открыт' : '🔒 Закрыт'}</div>
            <div>Создан: ${new Date(ticket.created_at).toLocaleString()}</div>
            ${ticket.closed_at ? `<div>Закрыт: ${new Date(ticket.closed_at).toLocaleString()}</div>` : ''}
            <div class="ticket-actions">
                <button class="admin-ticket-chat-btn" data-ticket-id="${ticket.id}">💬 Открыть чат</button>
                ${ticket.status === 'open' ? `<button class="admin-ticket-close-btn" data-ticket-id="${ticket.id}">🔒 Закрыть тикет</button>` : ''}
            </div>
        </div>
    `).join('');
    document.querySelectorAll('.admin-ticket-chat-btn').forEach(btn => {
        btn.addEventListener('click', () => openAdminTicketChat(btn.dataset.ticketId));
    });
    document.querySelectorAll('.admin-ticket-close-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Закрыть тикет?')) {
                await supabase.from('tickets').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', btn.dataset.ticketId);
                renderAdminTickets();
                showNeonNotification('Тикет закрыт', 'info');
            }
        });
    });
}

async function openAdminTicketChat(ticketId) {
    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
    const { data: messages } = await supabase.from('ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
    let modal = document.getElementById('adminTicketChatModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'adminTicketChatModal';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content chat-modal-content"><span class="close-modal">&times;</span><h3>Тикет #<span id="ticketIdSpan"></span> от <span id="ticketUserSpan"></span></h3><div id="ticketChatMessages" class="chat-messages"></div><textarea id="ticketChatMessageText" rows="2" placeholder="Ответ пользователю..."></textarea><button id="ticketSendMessageBtn">Отправить</button></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => closeModal('adminTicketChatModal');
        window.onclick = (e) => { if (e.target === modal) closeModal('adminTicketChatModal'); };
    }
    document.getElementById('ticketIdSpan').innerText = ticketId;
    document.getElementById('ticketUserSpan').innerText = `${ticket.user_name} (${ticket.user_email})`;
    const container = document.getElementById('ticketChatMessages');
    container.innerHTML = '';
    (messages || []).forEach(msg => {
        const div = document.createElement('div');
        div.className = `chat-message ${msg.sender}`;
        div.innerHTML = `<strong>${msg.sender === 'user' ? 'Пользователь' : 'Администратор'}:</strong> ${msg.message}<br><small>${new Date(msg.created_at).toLocaleString()}</small>`;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
    const sendBtn = document.getElementById('ticketSendMessageBtn');
    const newSend = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSend, sendBtn);
    newSend.onclick = async () => {
        const text = document.getElementById('ticketChatMessageText').value.trim();
        if (!text) return;
        await supabase.from('ticket_messages').insert({
            ticket_id: ticketId,
            sender: 'admin',
            message: text,
            created_at: new Date().toISOString()
        });
        document.getElementById('ticketChatMessageText').value = '';
        openAdminTicketChat(ticketId);
        showNeonNotification('Ответ отправлен', 'success');
    };
    showModal('adminTicketChatModal');
}

async function renderAdminTopupRequests() {
    const container = document.getElementById('adminTopupRequestsContainer');
    if (!container) return;
    const { data: requests } = await supabase.from('topup_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true });
    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="empty-msg">Нет заявок на пополнение</div>';
        return;
    }
    container.innerHTML = requests.map(req => `
        <div class="admin-topup-request">
            <div><strong>${req.amount} руб.</strong> от ${req.user_email}</div>
            <div>Создана: ${new Date(req.created_at).toLocaleString()}</div>
            <button class="approve-topup-btn" data-request-id="${req.id}">✅ Подтвердить пополнение</button>
        </div>
    `).join('');
    document.querySelectorAll('.approve-topup-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.requestId;
            const req = requests.find(r => r.id == id);
            if (req && confirm('Подтвердить пополнение?')) {
                await supabase.from('profiles').update({ balance: supabase.rpc('increment', { row_id: req.user_id, amount: req.amount }) });
                await supabase.from('topup_requests').update({ status: 'approved' }).eq('id', id);
                renderAdminTopupRequests();
                showNeonNotification(`Пополнение ${req.amount} руб. подтверждено`, 'success');
            }
        });
    });
}

async function renderAdminProducts() {
    const container = document.getElementById('adminProductsList');
    if (!container) return;
    if (window.products.length === 0) {
        container.innerHTML = '<div class="empty-msg">Товары отсутствуют</div>';
        return;
    }
    container.innerHTML = window.products.map(p => `
        <div class="admin-product-item" data-id="${p.id}">
            <div style="display:flex; align-items:center; gap:0.8rem;">
                ${isImageData(p.image) ? `<img src="${p.image}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;">` : `<span style="font-size:1.5rem;">${p.image}</span>`}
                <span><strong>${p.name}</strong> — ${p.price_str} (${p.category})</span>
            </div>
            <button class="delete-product-btn" data-id="${p.id}">🗑️ Удалить</button>
        </div>
    `).join('');
    document.querySelectorAll('.delete-product-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            await deleteProduct(id);
        });
    });
}

// ==================== ФУНКЦИИ ДЛЯ ПОДДЕРЖКИ (СОЗДАНИЕ ТИКЕТА) ====================
async function setupSupportForm() {
    const sendBtn = document.getElementById('sendSupportBtn');
    if (!sendBtn) return;
    sendBtn.addEventListener('click', async () => {
        const name = document.getElementById('supportName').value.trim();
        const email = document.getElementById('supportEmail').value.trim();
        const msg = document.getElementById('supportMsg').value.trim();
        if (!name || !email || !msg) { showNeonNotification('Заполните все поля', 'error'); return; }
        let userEmail = currentUser ? currentUser.email : email;
        let userName = currentUser ? currentUser.name : name;
        const { data, error } = await supabase.from('tickets').insert({
            user_id: currentUser?.id || null,
            user_email: userEmail,
            user_name: userName,
            status: 'open',
            created_at: new Date().toISOString()
        }).select();
        if (error) { showNeonNotification('Ошибка создания тикета', 'error'); return; }
        const ticketId = data[0].id;
        await supabase.from('ticket_messages').insert({
            ticket_id: ticketId,
            sender: 'user',
            message: msg,
            created_at: new Date().toISOString()
        });
        showNeonNotification('Обращение создано! Администратор ответит в чате.', 'success');
        document.getElementById('supportName').value = '';
        document.getElementById('supportEmail').value = '';
        document.getElementById('supportMsg').value = '';
        if (window.location.pathname.includes('my-tickets.html')) renderUserTickets();
    });
}

// ==================== МОДАЛЬНЫЕ ОКНА (ОБЩИЕ) ====================
let currentModalMode = 'login';
let selectedTopupAmount = 0;

function showModal(modalId, mode = 'login') {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (modalId === 'authModal') {
        currentModalMode = mode;
        const title = document.getElementById('modalTitle');
        const submitBtn = document.getElementById('modalSubmitBtn');
        const toggleText = document.getElementById('toggleAuthMode');
        const nameField = document.getElementById('authName');
        if (mode === 'login') {
            title.innerText = 'Вход';
            submitBtn.innerText = 'Войти';
            toggleText.innerHTML = 'Нет аккаунта? <a href="#" id="switchToRegister">Зарегистрироваться</a>';
            nameField.style.display = 'none';
            nameField.required = false;
        } else {
            title.innerText = 'Регистрация';
            submitBtn.innerText = 'Зарегистрироваться';
            toggleText.innerHTML = 'Уже есть аккаунт? <a href="#" id="switchToLogin">Войти</a>';
            nameField.style.display = 'block';
            nameField.required = true;
        }
        document.getElementById('authForm').reset();
        const msgDiv = document.getElementById('authMessage');
        if (msgDiv) msgDiv.innerText = '';
        const switchLink = toggleText.querySelector('a');
        if (switchLink) switchLink.onclick = (e) => { e.preventDefault(); showModal('authModal', currentModalMode === 'login' ? 'register' : 'login'); };
    } else if (modalId === 'topupAmountModal') {
        document.getElementById('topupAmount').value = '';
    } else if (modalId === 'topupBankModal') {
        document.getElementById('bankAmount').innerText = selectedTopupAmount;
        const userEmailSpan = document.getElementById('userEmailForTopup');
        if (userEmailSpan && currentUser) userEmailSpan.innerText = currentUser.email;
    }
    modal.style.display = 'flex';
}
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}
function showTopupModal() { showModal('topupAmountModal'); }

function setupTopupHandlers() {
    const chooseAmountBtn = document.getElementById('chooseTopupAmount');
    if (chooseAmountBtn) {
        chooseAmountBtn.addEventListener('click', () => {
            const amount = parseInt(document.getElementById('topupAmount').value);
            if (isNaN(amount) || amount <= 0) { showNeonNotification('Введите корректную сумму', 'error'); return; }
            selectedTopupAmount = amount;
            closeModal('topupAmountModal');
            showModal('topupBankModal');
        });
    }
    const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');
    if (confirmPaymentBtn) {
        confirmPaymentBtn.addEventListener('click', async () => {
            if (!currentUser) { showNeonNotification('Сначала войдите', 'error'); closeModal('topupBankModal'); showModal('authModal', 'login'); return; }
            await createTopupRequest(selectedTopupAmount);
            closeModal('topupBankModal');
        });
    }
}

// ==================== ВЫДВИЖНОЕ МЕНЮ (САЙДБАР) ====================
let userSidebar = null;
let sidebarOverlay = null;

function createUserSidebar() {
    if (userSidebar) userSidebar.remove();
    if (sidebarOverlay) sidebarOverlay.remove();
    const oldToggle = document.getElementById('userMenuToggle');
    if (oldToggle) oldToggle.remove();

    const toggleBtn = document.createElement('div');
    toggleBtn.id = 'userMenuToggle';
    toggleBtn.className = 'user-menu-toggle';
    toggleBtn.innerHTML = '👤';
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) navLinks.appendChild(toggleBtn);

    sidebarOverlay = document.createElement('div');
    sidebarOverlay.id = 'sidebarOverlay';
    sidebarOverlay.className = 'sidebar-overlay';
    document.body.appendChild(sidebarOverlay);

    userSidebar = document.createElement('div');
    userSidebar.id = 'userSidebar';
    userSidebar.className = 'user-sidebar';
    userSidebar.innerHTML = `
        <div class="sidebar-header">
            <h3>Профиль</h3>
            <button class="sidebar-close">&times;</button>
        </div>
        <div class="sidebar-content">
            <div class="user-avatar">👤</div>
            <div class="user-name" id="sidebarUserName">Гость</div>
            <div class="user-email" id="sidebarUserEmail">Не авторизован</div>
            <div class="user-balance" id="sidebarUserBalance">Баланс: 0 руб.</div>
            <button id="sidebarTopUpBtn" class="sidebar-btn topup">➕ Пополнить</button>
            <button id="sidebarAuthBtn" class="sidebar-btn auth">Войти</button>
        </div>
    `;
    document.body.appendChild(userSidebar);

    toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); userSidebar.classList.add('open'); sidebarOverlay.classList.add('show'); });
    userSidebar.querySelector('.sidebar-close').addEventListener('click', () => { userSidebar.classList.remove('open'); sidebarOverlay.classList.remove('show'); });
    sidebarOverlay.addEventListener('click', () => { userSidebar.classList.remove('open'); sidebarOverlay.classList.remove('show'); });
}

function updateSidebarContent() {
    const nameEl = document.getElementById('sidebarUserName');
    const emailEl = document.getElementById('sidebarUserEmail');
    const balanceEl = document.getElementById('sidebarUserBalance');
    const authBtn = document.getElementById('sidebarAuthBtn');
    if (currentUser) {
        if (nameEl) nameEl.textContent = currentUser.name;
        if (emailEl) emailEl.textContent = currentUser.email;
        getUserBalance().then(balance => { if (balanceEl) balanceEl.textContent = `Баланс: ${balance} руб.`; });
        if (authBtn) authBtn.textContent = 'Выйти';
    } else {
        if (nameEl) nameEl.textContent = 'Гость';
        if (emailEl) emailEl.textContent = 'Не авторизован';
        if (balanceEl) balanceEl.textContent = 'Баланс: 0 руб.';
        if (authBtn) authBtn.textContent = 'Войти';
    }
    const topupBtn = document.getElementById('sidebarTopUpBtn');
    if (topupBtn) {
        const newTopup = topupBtn.cloneNode(true);
        topupBtn.parentNode.replaceChild(newTopup, topupBtn);
        newTopup.addEventListener('click', () => { if (currentUser) showTopupModal(); else showNeonNotification('Сначала войдите', 'info'); });
    }
    if (authBtn) {
        const newAuth = authBtn.cloneNode(true);
        authBtn.parentNode.replaceChild(newAuth, authBtn);
        newAuth.addEventListener('click', () => { if (currentUser) logout(); else showModal('authModal', 'login'); });
    }
}

function updateAuthUI() {
    // nothing extra
}

// ==================== ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ ====================
document.addEventListener('DOMContentLoaded', async () => {
    applyNeonTheme();
    createUserSidebar();
    await loadProducts();
    await loadCurrentUser();
    setupSupportForm();
    setupTopupHandlers();

    // Удаляем старые кнопки авторизации и баланса из шапки
    const oldAuthBtn = document.getElementById('authBtn');
    if (oldAuthBtn) oldAuthBtn.remove();
    const oldBalanceArea = document.getElementById('balanceArea');
    if (oldBalanceArea) oldBalanceArea.remove();

    // Модальные окна: закрытие по крестику
    const closeAuth = document.querySelector('#authModal .close-modal');
    if (closeAuth) closeAuth.addEventListener('click', () => closeModal('authModal'));
    const authForm = document.getElementById('authForm');
    if (authForm) authForm.addEventListener('submit', handleAuthSubmit);
    const closeTopupAmount = document.getElementById('closeTopupAmountModal');
    if (closeTopupAmount) closeTopupAmount.addEventListener('click', () => closeModal('topupAmountModal'));
    const closeTopupBank = document.getElementById('closeTopupBankModal');
    if (closeTopupBank) closeTopupBank.addEventListener('click', () => closeModal('topupBankModal'));
    const closeProduct = document.getElementById('closeProductModal');
    if (closeProduct) closeProduct.addEventListener('click', () => closeModal('productModal'));
    const closeAdminBalance = document.getElementById('closeAdminBalanceModal');
    if (closeAdminBalance) closeAdminBalance.addEventListener('click', () => closeModal('adminEditBalanceModal'));
    window.addEventListener('click', (e) => { if (e.target.classList.contains('modal')) closeModal(e.target.id); });

    // Карусель
    if (document.getElementById('carouselTrack')) {
        rebuildCarousel();
        document.getElementById('carouselPrevBtn')?.addEventListener('click', () => { const track = document.getElementById('carouselTrack'); if (track) track.scrollBy({ left: -260, behavior: 'smooth' }); });
        document.getElementById('carouselNextBtn')?.addEventListener('click', () => { const track = document.getElementById('carouselTrack'); if (track) track.scrollBy({ left: 260, behavior: 'smooth' }); });
    }

    // Быстрая покупка (если есть кнопка на главной)
    const buyBtn = document.getElementById('buyProductBtn');
    if (buyBtn) {
        buyBtn.addEventListener('click', () => {
            const title = document.getElementById('selectedProductTitle')?.innerText;
            const product = window.products.find(p => p.name === title);
            if (product) attemptPurchase(product);
        });
    }

    // Каталог (фильтрация)
    if (document.getElementById('catalogGrid')) {
        const categoryBtns = document.querySelectorAll('.category-btn');
        categoryBtns.forEach(btn => btn.addEventListener('click', () => { categoryBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentCatalogCategory = btn.dataset.category; renderCatalog(currentCatalogCategory); }));
        renderCatalog(currentCatalogCategory);
    }

    // Страницы
    if (window.location.pathname.includes('purchases.html')) renderUserOrders();
    if (window.location.pathname.includes('my-tickets.html')) renderUserTickets();
    if (window.location.pathname.includes('admin.html')) {
        if (currentUser && currentUser.role === 'admin') {
            renderAdminUsers();
            renderAdminOrders();
            renderAdminTickets();
            renderAdminTopupRequests();
            renderAdminProducts();
            const addForm = document.getElementById('addProductForm');
            if (addForm) {
                addForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const name = document.getElementById('prodName').value.trim();
                    const priceNum = parseInt(document.getElementById('prodPrice').value);
                    const desc = document.getElementById('prodDesc').value.trim();
                    const category = document.getElementById('prodCategory').value;
                    const imageFile = document.getElementById('prodImage').files[0];
                    if (!name || isNaN(priceNum) || !desc || !category || !imageFile) {
                        showNeonNotification('Заполните все поля и выберите изображение', 'error');
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = async function(event) {
                        const imageData = event.target.result;
                        await addProduct(name, priceNum, desc, imageData, category);
                        addForm.reset();
                    };
                    reader.readAsDataURL(imageFile);
                });
            }
        } else if (currentUser) {
            document.body.innerHTML = '<div class="app-container"><h2>Доступ запрещён</h2><a href="index.html">На главную</a></div>';
        }
    }
});

function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    const name = document.getElementById('authName').value.trim();
    if (!email || !password) { showNeonNotification('Заполните email и пароль', 'error'); return; }
    if (currentModalMode === 'login') {
        login(email, password);
    } else {
        if (!name) { showNeonNotification('Введите имя', 'error'); return; }
        register(name, email, password);
    }
}