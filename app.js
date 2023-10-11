// Ждет событие "Создание окна для оставления комментария" и добавляет кнопку
window.document.addEventListener('DOMNodeInserted', function(event) {
    // Событие - создалось новое окно или открылось окно на редактирование существующего комментария
    if (event.target.className == "source-tree__line-comment-wrapper" || event.target.className =="source-tree__comment-editor"){
        const newCommentWindow = event.target.querySelector(".comment-editor__top-bar");
        if (!newCommentWindow.classList.contains('has_review_button')){
            let newDiv = document.createElement('div');
            newDiv.className = 'button button_size_l button_type_default button_theme_light button_view_transparent review_button add_comment_button';
            newDiv.innerHTML = 'Шаблоны ответов';
            newCommentWindow.append(newDiv);
            newCommentWindow.classList.add('has_review_button');
            openReviewTemplatesWindow(newCommentWindow);
            newCommentWindow.lastChild.onclick = function(){
                openReviewTemplatesWindow(newCommentWindow);
            };
            addEventListenerToBaseCommentField(event.target);
        }
    };
});

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

function onloadAddScriptOnTemplatesCommentExportDB(reviewerWindow) {
    let templateCommentButton = reviewerWindow.querySelector('.export_DB');
    templateCommentButton.onclick = function(){
        db.readTransaction(function(tx){
            tx.executeSql(
                'SELECT * FROM commentsTable',
                [],
                function(tx, results){
                    let db_list = [];
                    for (let i=0; i < results.rows.length; i++) {
                        db_list.push(results.rows[i]);
                    }
                    download('dump.json', JSON.stringify(db_list));
                },
                function(tx, error){
                    console.log(error);
                }
            );
        });
    }
}

function download(filename, text) {
    let element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    reviewerWindow.appendChild(element);
    element.click();
    reviewerWindow.removeChild(element);
}

function onloadAddScriptOnTemplatesCommentImportDB(reviewerWindow) {
    let templateCommentButton = reviewerWindow.querySelector('.import_DB');
    templateCommentButton.onclick = function(){
        let element = document.createElement('input');
        element.setAttribute('type', 'file');
        element.style.display = 'none';
        element.addEventListener('change', (e) => {
            let t = e.target.files[0].text();
            t.then((result) => importDB(result, element));
        });
        element.click();
    }
}

function importDB(result, element) {
    let res_json = JSON.parse(result);
    let db = connectDB();
    for (const row of res_json) {
        db.transaction(function(tx){
            tx.executeSql(
                "INSERT INTO commentsTable (text, sprint, level) values(?, ?, ?)",
                [row['text'], row['sprint'], row['level']],
                function(tx, error){
                    tx.executeSql(
                        "CREATE TABLE commentsTable (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, sprint SMALLINT, level SMALLINT)",
                        [],
                        function (tx, result){
                            tx.executeSql(
                                "INSERT INTO answers (game_id, question_id, answer0, answer1, answer2, answer3, right_answer) values (?, ?, ?, ?, ?, ?, ?)",
                                [row['game_id'], row['question_id'], row['answer0'], row['answer1'], row['answer2'], row['answer3'], row['right_answer']]
                            );
                        },
                        function (tx, error){
                        }
                    );
                }
            );
        });
    }
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
    db = openDatabase("myCommentsDB", "0.1", "Reviewer comments storage", 200000);
    if(!db){alert("Не удается пеодключиться к базе комментариев.");}
    return db
}

// Сохранение комментария в БД
function addNewCommentToDatabase(reviewerWindow){
    let text = reviewerWindow.querySelector(".new_comment_textarea").value.replaceAll("\n", "<br>");
    let sprint = reviewerWindow.querySelector(".sprint_select_add_comment").value;
    let level = reviewerWindow.querySelector(".level_select_add_comment").value;
    if (!text){
        return notificationCommentFailedSaveMessage("Нельзя сохранить комментарий без текста");
    };
    let db = connectDB();
    db.transaction(function(tx) {
        tx.executeSql("INSERT INTO commentsTable (text, sprint, level) values(?, ?, ?)", [text, sprint, level], function (result) {  notificationCommentSavedMessage(reviewerWindow, "Комментарий сохранен"); }, function (tx, error) {
        tx.executeSql("CREATE TABLE commentsTable (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, sprint SMALLINT, level SMALLINT)", [], function (tx, result){
            tx.executeSql("INSERT INTO commentsTable (text, sprint, level) values(?, ?, ?)", [text, sprint, level],function(result){notificationCommentSavedMessage(reviewerWindow, "Комментарий сохранен");},function (tx, error) {alert("Ошибка сохранения комментария")})

        },function (tx, error){alert("Ошибка создания БД" + error)} );
    })});
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

// Заполнение окна с шаблонами комментариев с текущей маской поиска и маской спринта на вкладке "Шаблоны комментариев"
function fillReviewerCommentsWindow(reviewerWindow, key){
    let textToSearch = "%" + reviewerWindow.querySelector(".text_to_search_field").value + key + "%";
    let sprintToSearch = reviewerWindow.querySelector(".sprint_to_search").value;
    clearCommentsSearchWindow(reviewerWindow);


    let db = connectDB();
    db.transaction(function(tx) {
        if (sprintToSearch == 0){
            tx.executeSql("SELECT * FROM commentsTable WHERE text LIKE ? ORDER BY sprint ASC, text ASC", [textToSearch,], function (tx, result) {
                printOneFoundCommentToReviewerCommentWindow(reviewerWindow, result);
            }, function (tx, error){alert("Ошибка запроса в БД при получении комментариев, либо еще не созданы коментарии")});
        }
        else{
            tx.executeSql("SELECT * FROM commentsTable WHERE (text LIKE ? and (sprint=? OR sprint=0)) ORDER BY sprint DESC, text ASC", [textToSearch, sprintToSearch], function (tx, result) {
                printOneFoundCommentToReviewerCommentWindow(reviewerWindow, result);
            }, function (tx, error){alert("Ошибка запроса в БД при получении комментариев, либо еще не созданы коментарии")});
        }
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

// Вывод в окно результатов поиска одно конкретного комментария на вкладке "Шаблоны комментариев"
function printOneFoundCommentToReviewerCommentWindow(reviewerWindow, result){
    for(var i = 0; i < result.rows.length; i++) {
        let newText = result.rows.item(i)['text'].replaceAll("<br>", "\n").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"','&quot;');
        let newSprint = result.rows.item(i)['sprint'];
        let newId = result.rows.item(i)['id'];
        let newLevel = result.rows.item(i)['level'];

        let newDiv = document.createElement('div');

        fetch(chrome.runtime.getURL('/one_comment_template.html')).then(r => r.text()).then(html => {
            html = html.replace('comment_visible_id',newId);
            html = html.replace('comment_text',newText);
            html = html.replace('comment_sprint',newSprint);
            html = html.replace('comment_level',newLevel);
            newDiv.innerHTML = html;
        });

        reviewerWindow.querySelector(".notes_row_body").append(newDiv);
    
    };
    setTimeout(() => {addOnclickScriptToRemoveCommentButtons(reviewerWindow); addOnclickScriptToTextField(reviewerWindow)}, 100);
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

// Удаление комментария из БД из вкладки "Шаблоны комментариев"
function removeCommentFromDB(button){
    let db = connectDB();
    commentIdToRemove = button.parentElement.parentElement.querySelector(".search_results_comment_id").innerHTML;
    db.transaction(function(tx) {
        tx.executeSql("DELETE FROM commentsTable WHERE id = ?", [commentIdToRemove,], 
        function (tx, result) {notificationCommentDeletedMessage("Комментарий удален")}, 
        function (tx, error){alert("Ошибка запроса в БД при удалении комментария")});
        });
    commentRowToRemoveFromWindow = button.parentElement.parentElement;
    commentRowToRemoveFromWindow.parentNode.removeChild(commentRowToRemoveFromWindow);
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
        case "Проект спринта: CRUD для Yatube":
            sprintNumber = 7;
            break;
        case "Проект спринта: API для Yatube":
            sprintNumber = 8;
            break;
        case "Проект спринта: Yamdb":
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
        case "Проект спринта: CI и CD проекта api_yamdb":
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
        case "Проект спринта: парсер PEP":
            sprintNumber = 18;
            break;
    }
    return sprintNumber
}
