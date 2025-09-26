const db = new Dexie("myCommentsDB");
db.version(1).stores({
    commentsTable: '++id, text, sprint, level'
});

// Use MutationObserver instead of deprecated DOMNodeInserted
const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
        for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;

            if (
                node.classList.contains("source-tree__line-comment-wrapper") ||
                node.classList.contains("source-tree__comment-editor")
            ) {
                const newCommentWindow = node.querySelector(".comment-editor__top-bar");
                if (newCommentWindow && !newCommentWindow.classList.contains("has_review_button")) {
                    let newDiv = document.createElement('div');
                    newDiv.className = 'button button_size_l button_type_default button_theme_light button_view_transparent review_button add_comment_button';
                    newDiv.innerHTML = 'Шаблоны ответов';
                    newCommentWindow.append(newDiv);
                    newCommentWindow.classList.add('has_review_button');
                    openReviewTemplatesWindow(newCommentWindow);
                    newCommentWindow.lastChild.onclick = function(){
                        openReviewTemplatesWindow(newCommentWindow);
                    };
                    addEventListenerToBaseCommentField(node);
                }
            }
        }
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Replaces connectDB and WebSQL logic with Dexie
async function addNewCommentToDatabase(reviewerWindow){
    let text = reviewerWindow.querySelector(".new_comment_textarea").value.replaceAll("\n", "<br>");
    let sprint = parseInt(reviewerWindow.querySelector(".sprint_select_add_comment").value);
    let level = parseInt(reviewerWindow.querySelector(".level_select_add_comment").value);
    if (!text){
        return notificationCommentFailedSaveMessage("Нельзя сохранить комментарий без текста");
    }
    try {
        await db.commentsTable.add({ text, sprint, level });
        notificationCommentSavedMessage(reviewerWindow, "Комментарий сохранен");
    } catch (err) {
        alert("Ошибка сохранения комментария: " + err);
    }
}

function onloadAddScriptOnTemplatesCommentExportDB(reviewerWindow) {
    const button = reviewerWindow.querySelector('.export_DB');
    button.onclick = async function() {
        const data = await db.commentsTable.toArray();
        download('dump.json', JSON.stringify(data));
    }
}

function onloadAddScriptOnTemplatesCommentImportDB(reviewerWindow) {
    const button = reviewerWindow.querySelector('.import_DB');
    button.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.style.display = 'none';
        input.addEventListener('change', async (e) => {
            const content = await e.target.files[0].text();
            const data = JSON.parse(content);
            await db.commentsTable.bulkAdd(data);
            alert("Импорт завершен успешно");
        });
        input.click();
    }
}

async function fillReviewerCommentsWindow(reviewerWindow, key = "") {
    const search = reviewerWindow.querySelector(".text_to_search_field").value + key;
    const sprint = parseInt(reviewerWindow.querySelector(".sprint_to_search").value);

    clearCommentsSearchWindow(reviewerWindow);

    let results = [];
    if (sprint === 0) {
        results = await db.commentsTable.filter(row => row.text.toLowerCase().includes(search.toLowerCase())).toArray();
    } else {
        results = await db.commentsTable.filter(row => row.text.toLowerCase().includes(search.toLowerCase()) && (row.sprint === sprint || row.sprint === 0)).toArray();
    }

    printOneFoundCommentToReviewerCommentWindow(reviewerWindow, results);
}

function printOneFoundCommentToReviewerCommentWindow(reviewerWindow, result){
    for(let i = 0; i < result.length; i++) {
        const row = result[i];
        let newText = row.text.replaceAll("<br>", "\n").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"','&quot;');
        let newDiv = document.createElement('div');

        fetch(chrome.runtime.getURL('/one_comment_template.html')).then(r => r.text()).then(html => {
            html = html.replace('comment_visible_id', row.id);
            html = html.replace('comment_text', newText);
            html = html.replace('comment_sprint', row.sprint);
            html = html.replace('comment_level', row.level);
            newDiv.innerHTML = html;
            reviewerWindow.querySelector(".notes_row_body").append(newDiv);
        });
    }
    setTimeout(() => {
        addOnclickScriptToRemoveCommentButtons(reviewerWindow);
        addOnclickScriptToTextField(reviewerWindow);
    }, 100);
}

async function removeCommentFromDB(button){
    const id = parseInt(button.parentElement.parentElement.querySelector(".search_results_comment_id").innerText);
    await db.commentsTable.delete(id);
    button.parentElement.parentElement.remove();
    notificationCommentDeletedMessage("Комментарий удален");
}

function download(filename, text) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}


// Открывает окно заметок ревьюера и вешает скрипты на кнопки
function openReviewTemplatesWindow(elem){
    var elemToAdd = elem.parentElement;
    if (elemToAdd.classList.contains('has_opened_reviewer_notes_window')){
        elemToRemove = elemToAdd.querySelector('.reviewer_notes');
        elemToRemove.parentNode.removeChild(elemToRemove);
        elemToAdd.classList.remove('has_opened_reviewer_notes_window');
    }
    else{
        let newDiv = document.createElement('div');

        fetch(chrome.runtime.getURL('/add_edit_comment_window.html')).then(r => r.text()).then(html => {
            let sprintNumber = getSprintNumber();
            let lookupValue = '<option value="' + sprintNumber  + '">';
            let replaceTo = '<option selected value="' + sprintNumber + '">';

            html = html.replaceAll(lookupValue,replaceTo);
            newDiv.innerHTML = html;
        });
        newDiv.className = 'reviewer_notes';
        elemToAdd.append(newDiv);
        elemToAdd.classList.add('has_opened_reviewer_notes_window');
        reviewerWindow = elemToAdd.querySelector('.reviewer_notes');
        setTimeout(() => {  onloadAddScriptOnSaveCommentButton(reviewerWindow);
            onloadAddScriptOnTemplatesCommentButton(reviewerWindow);
            onloadAddScriptOnTemplatesCommentSaveButton(reviewerWindow);
            onloadAddScriptOnTemplatesCommentExportDB(reviewerWindow);
            onloadAddScriptOnTemplatesCommentImportDB(reviewerWindow);
            addEventListenerToSearcheField(reviewerWindow);
            addEventListenerToSprintSearchSelector(reviewerWindow);
            fillReviewerCommentsWindow(reviewerWindow, key="")
        }, 100);

    }
}

// Навешивание скрипта на нажатие кнопки "Сохранить текущий комментарий"
function onloadAddScriptOnSaveCommentButton(reviewerWindow){
    saveCommentButton = reviewerWindow.querySelector('.save_current_comment');
    saveCommentButton.onclick = function(){
        openSaveCommentWindow(reviewerWindow);
    }
}

// Навешивание скрипта на нажатие кнопки "Шаблоны комментариев"
function onloadAddScriptOnTemplatesCommentButton(reviewerWindow){
    templateCommentButton = reviewerWindow.querySelector('.templates_comment_button');
    templateCommentButton.onclick = function(){
        openTemplatesCommentWindow(reviewerWindow);
    }
}

// Вешает скрипт на кнопку сохранения комментария на вкладке "Сохранить текущий комментарий"
function onloadAddScriptOnTemplatesCommentSaveButton(reviewerWindow){
    templateCommentButton = reviewerWindow.querySelector('.save_current_comment_to_DB');
    templateCommentButton.onclick = function(){
        addNewCommentToDatabase(reviewerWindow);
    }
}



function importDB(result) {
    let res_json;

    try {
        res_json = JSON.parse(result);
    } catch (e) {
        alert("Ошибка парсинга JSON");
        return;
    }

    const valid = res_json.every(row =>
        typeof row.text === 'string' &&
        typeof row.sprint === 'number' &&
        typeof row.level === 'number'
    );

    if (!valid) {
        alert("Некорректный формат данных");
        return;
    }

    db.commentsTable.bulkAdd(res_json)
        .then(() => {
            alert("Импорт завершен успешно");
        })
        .catch((err) => {
            console.error("Ошибка при импорте:", err);
            alert("Ошибка при импорте данных в IndexedDB");
        });
}


// Переключение на вкладку "Сохранить текущий комментарий"
function openSaveCommentWindow(reviewerWindow){
    let saveCommentWindow = reviewerWindow.querySelector(".save_comment_window");
    saveCommentWindow.classList.remove("hidden_block");
    let existingNotesWindow = reviewerWindow.querySelector(".existing_notes_window");
    existingNotesWindow.classList.add("hidden_block");
    let searchNotesWindow = reviewerWindow.querySelector(".search_notes_window");
    searchNotesWindow.classList.add("hidden_block");
    let newCommentTextArea = saveCommentWindow.querySelector(".new_comment_textarea");
    let newCommentText = saveCommentWindow.parentElement.parentElement.parentElement.querySelector(".comment-editor__textarea").value;
    newCommentTextArea.value = newCommentText;

    let newCommentSelector = saveCommentWindow.querySelector(".level_select_add_comment");
    newCommentSelector.value = getCurrentCommentLevel(saveCommentWindow);
}
// Переключение на вкладку "Шаблоны комментариев"
function openTemplatesCommentWindow(reviewerWindow){
    let saveCommentWindow = reviewerWindow.querySelector(".save_comment_window");
    saveCommentWindow.classList.add("hidden_block");
    let existingNotesWindow = reviewerWindow.querySelector(".existing_notes_window");
    existingNotesWindow.classList.remove("hidden_block");
    let searchNotesWindow = reviewerWindow.querySelector(".search_notes_window");
    searchNotesWindow.classList.remove("hidden_block");
    fillReviewerCommentsWindow(reviewerWindow, key="")


}

// Определение уровня текущего комментария
function getCurrentCommentLevel(saveCommentWindow){
    let levelSelectorBar = saveCommentWindow.parentElement.parentElement.parentElement.querySelectorAll(".radio__input");
    for (let commentLevel = 0; commentLevel < 3; commentLevel++) {
        let inputValue = levelSelectorBar[commentLevel];
        if (inputValue.getAttribute("aria-checked") == "true"){
            return commentLevel;
        }
    }
}

// Подключение к БД коментариев
function connectDB(){
    const _db = openDatabase("myCommentsDB", "0.1", "Reviewer comments storage", 200000);
    if(!_db){alert("Не удается пеодключиться к базе комментариев.");}
    return _db
}

// Уведомление о сохранении комментария (смена текста на кнопке)
function notificationCommentSavedMessage(reviewerWindow, message){

    let saveButton = reviewerWindow.querySelector(".small_green_button");
    saveButton.innerHTML = "Сохранено"
    setTimeout(() => {saveButton.innerHTML = "Сохранить"}, 2000);
}

// Уведомление о неудаче при сохранении комментария в БД
function notificationCommentFailedSaveMessage(message){
    alert(message);
}

// Уведомление об удалении комменария
function notificationCommentDeletedMessage(message){

}

// Навешивание на поле поиска комментария скрипта прослушивания на поле "Шаблоны комментариев"
function addEventListenerToSearcheField(reviewerWindow){
    reviewerWindow.querySelector(".text_to_search_field").addEventListener('keypress', (event) => {
        if (reviewerWindow.querySelector(".text_to_search_field").value.length < 3){
            return 0;
        }
        fillReviewerCommentsWindow(reviewerWindow, event.key);
      });
}


function addEventListenerToBaseCommentField(newCommentWindow){
    commentTextArea = newCommentWindow.querySelector(".comment-editor__textarea");
    commentTextArea.addEventListener('keypress', (event) => {
        if (commentTextArea.value.length < 3 || commentTextArea.value.length > 10){
            return 0;
        }
        let reviewerWindow = newCommentWindow.parentNode.querySelector(".reviewer_notes")
        reviewerWindow.querySelector(".text_to_search_field").value = commentTextArea.value + event.key;
        fillReviewerCommentsWindow(reviewerWindow, "");
      });
}

// Навешивание на поле спринта скрипта прослушивания на поле "Шаблоны комментариев"
function addEventListenerToSprintSearchSelector(reviewerWindow){
    reviewerWindow.querySelector(".sprint_to_search").addEventListener('change', (event) => {
        fillReviewerCommentsWindow(reviewerWindow,'');
    });
}

// Очистка от старых результатов окна с результатами поиска на вкладке "Шаблоны комментариев"
function clearCommentsSearchWindow(reviewerWindow){
    let currentComments = reviewerWindow.querySelectorAll(".comment_from_db_row");
    currentComments.forEach((elem)=>{
        let elemToRemove = elem.parentElement;
        elemToRemove.parentNode.removeChild(elemToRemove);
    });
}

// Навешивание скрипта прослушивания на поле текста комментария в окне результатов поиска на вкладке "Шаблоны комментариев"
function addOnclickScriptToTextField(reviewerWindow){
    let textFields = reviewerWindow.querySelectorAll(".search_results_text_window");
    textFields.forEach((elem)=>{
        elem.onclick = function(){
            addCurrentTextToReviewWindow(elem);
        }
    })
}
// Перенос текста из окна результатов поиска в окно оставления комментария ЯП
function addCurrentTextToReviewWindow(commentTextElem){
    let textToAdd = commentTextElem.innerHTML.replaceAll("&lt;", "<").replaceAll("&gt;",">").replaceAll('&quot;', '"');
    let commentLevel = Number(commentTextElem.parentElement.querySelector(".search_results_level_window").innerHTML);
    let textFieldToAdd = commentTextElem.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.querySelector(".comment-editor__textarea");
    textFieldToAdd.value = textToAdd;
    var evt = document.createEvent("Events");
    evt.initEvent("change", true, true);
    textFieldToAdd.dispatchEvent(evt);
    commentSelectorBar = commentTextElem.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.querySelector(".radio-group-default");
    commentSelectorBar.childNodes[commentLevel].click();
}

// Навешивание скрипта на кнопку удаления комментария из БД
function addOnclickScriptToRemoveCommentButtons(){
    let deleteButtons = reviewerWindow.querySelectorAll(".small_red_button");
    deleteButtons.forEach((elem)=>{
        elem.onclick = function(){
            removeCommentFromDB(elem);
        }
    });
}

// Получение номера спринта
function getSprintNumber(){
    let folderName = document.querySelector(".source-tree__folder-description").querySelector(".source-tree__folder-name").innerHTML
    let sprintNumber = 1;

    switch(folderName){
        case "Проект спринта: модуль фитнес-трекера":
            sprintNumber = 1;
            break;
        case "Проект спринта: сообщества":
            sprintNumber = 2;
            break;
        case "Проект спринта: новые записи":
            sprintNumber = 3;
            break;
        case "Проект спринта: покрытие тестами":
            sprintNumber = 4;
            break;
        case "Проект спринта: подписки на авторов":
            sprintNumber = 5;
            break;
        case "Проект спринта: деплой бота":
            sprintNumber = 6;
            break;
        case "Финальный проект спринта: деплой бота":
            sprintNumber = 6;
            break;
        case "Проект спринта: CRUD для Yatube":
            sprintNumber = 7;
            break;
        case "Финальный проект спринта: CRUD для Yatube":
            sprintNumber = 7;
            break;
        case "Проект спринта: API для Yatube":
            sprintNumber = 8;
            break;
        case "Финальный проект спринта: API для Yatube":
            sprintNumber = 8;
            break;
        case "Проект спринта: Yamdb":
            sprintNumber = 9;
            break;
        case "Проект: Yamdb":
            sprintNumber = 9;
            break;
        case "Задание спринта: введение в алгоритмы":
            sprintNumber = 10;
            break;
        case "Задание спринта: основные структуры данных":
            sprintNumber = 11;
            break;
        case "Задание спринта: рекурсия и сортировки":
            sprintNumber = 12;
            break;
        case "Проект спринта: запуск docker-compose":
            sprintNumber = 13;
            break;
        case "Финальный проект: контейнеры и CI/CD для Kittygram":
            sprintNumber = 14;
            break;
        case "Как сдавать проект":
            sprintNumber = 15;
            break;
        case "Финальный проект спринта: Блогикум":
            sprintNumber = 16;
            break;
        case "Финальный проект спринта: публикации для Блогикум":
            sprintNumber = 17;
            break;
        case "Финальный проект спринта: доработка Блогикум":
            sprintNumber = 18;
            break;
        case "Финальный проект спринта: Vice Versa":
            sprintNumber = 19;
            break;
        case "Проект спринта: парсер PEP":
            sprintNumber = 20;
            break;
        case "Финальный проект спринта: Парсинг PEP":
            sprintNumber = 20;
            break;
        case "Финальный проект спринта: асинхронный парсер PEP":
            sprintNumber = 21;
            break;
        case "Финальный проект спринта: сервис YaCut":
            sprintNumber = 22;
            break;
        case "Финальный проект YaCut":
            sprintNumber = 22;
            break;
        case "Финальный проект спринта: приложение QRKot":
            sprintNumber = 23;
            break;
        case "Финальный проект спринта: отчёт в Google Sheets для QRKot":
            sprintNumber = 24;
            break;
        case "Финальный проект спринта: «Изгиб Питона»":
            sprintNumber = 25;
            break;
        case "Финальное задание спринта: служба доставки":
            sprintNumber = 26;
            break;
        case "Финальное задание спринта: шифрованные инструкции":
            sprintNumber = 27;
            break;
        case "Финальное задание: «Шифрованные инструкции»":
            sprintNumber = 27;
            break;
        case "Сдача итогового проекта «Фудграм»":
            sprintNumber = 28;
            break;
    }
    return sprintNumber
}
