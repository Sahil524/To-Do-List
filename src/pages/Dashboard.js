import React, { useState, useEffect, useRef } from "react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import "./Dashboard.css";

export default function Dashboard() {
    const [tasks, setTasks] = useState([]);
    const [filter, setFilter] = useState("all");
    const [expandedDates, setExpandedDates] = useState({});
    const [showDetails, setShowDetails] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState("add"); // "add" or "edit"
    const [taskForm, setTaskForm] = useState({
        title: "",
        description: "",
        category: "",
        date: "",
        time: "",
        priority: "None"
    });

    const presetCategories = [
        { name: "Social Media Posting", color: "#FF5733" },
        { name: "YouTube Posting", color: "#FF8D1A" },
        { name: "Meeting", color: "#FFC300" },
        { name: "Zoom Meeting", color: "#DAF7A6" },
        { name: "Call", color: "#75FF33" },
        { name: "Message", color: "#33FFBD" },
        { name: "Reminder", color: "#33C1FF" },
        { name: "Email Follow-up", color: "#3375FF" },
        { name: "Report Submission", color: "#8E33FF" },
        { name: "Presentation Prep", color: "#C70039" },
        { name: "Code Review", color: "#900C3F" },
        { name: "Others", color: "#808080" }
    ];

    const handleCategoryToggle = (categoryName) => {
        setTaskForm((prev) => {
            let currentCategories = prev.category ? prev.category.split(",") : [];
            if (currentCategories.includes(categoryName)) {
                currentCategories = currentCategories.filter(c => c !== categoryName);
            } else {
                currentCategories.push(categoryName);
            }
            return { ...prev, category: currentCategories.join(",") };
        });
    };



    const saveTimeout = useRef(null);
    const today = new Date().toISOString().split("T")[0];

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = () => {
        fetch("http://localhost:5000/api/tasks?user_id=" + localStorage.getItem("uid"))
            .then(res => res.json())
            .then(data => {
                if (!data || !Array.isArray(data.tasks)) {
                    console.error("Invalid tasks response", data);
                    return;
                }

                // Normalize backend dates to YYYY-MM-DD
                const normalized = data.tasks.map(t => {
                    const parsed = new Date(t.date);
                    const dateStr = isNaN(parsed.getTime()) ? t.date : parsed.toISOString().split("T")[0];
                    return { ...t, date: dateStr };
                });

                // Auto mark as done if task date < today (use normalized dates)
                const todayDateObj = new Date(today);
                const autoMarked = normalized.map(task => {
                    if (!task.date) return task;
                    const taskDateObj = new Date(task.date);
                    if (taskDateObj < todayDateObj && task.done !== 1) {
                        fetch(`http://localhost:5000/api/mark-done/${task.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ done: 1 })
                        }).catch(err => console.error("Auto mark failed:", err));
                        return { ...task, done: 1 };
                    }
                    return task;
                });

                if (data.success) {
                    setTasks(autoMarked);

                    if (filter === "all") {
                        setTimeout(() => {
                            const todaySection = document.querySelector(`[data-date='${today}']`);
                            if (todaySection) todaySection.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 100);
                    }

                    const initialExpanded = {};
                    autoMarked.forEach(t => { if (t.date) initialExpanded[t.date] = true; });
                    setExpandedDates(initialExpanded);
                }
            })

            .catch(err => console.error("Error fetching tasks:", err));
    };

    const filteredTasks = tasks.filter(task => {
        // Convert backend date string to YYYY-MM-DD format
        const taskDateStr = new Date(task.date).toISOString().split("T")[0];
        const todayDateStr = today;

        if (filter === "day") {
            return taskDateStr === todayDateStr;
        }

        if (filter === "week") {
            const taskDate = new Date(taskDateStr);
            const todayDate = new Date(todayDateStr);
            const dayOfWeek = todayDate.getDay();
            const startOfWeek = new Date(todayDate);
            startOfWeek.setDate(todayDate.getDate() - dayOfWeek);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            return taskDate >= startOfWeek && taskDate <= endOfWeek;
        }

        return true;
    });


    const groupedTasks = filteredTasks
        .sort((a, b) => new Date(a.date) - new Date(b.date) || (a.time || "").localeCompare(b.time || ""))

        .reduce((acc, task) => {
            if (!acc[task.date]) acc[task.date] = [];
            acc[task.date].push(task);
            return acc;
        }, {});


    const handleDragEnd = (result) => {
        if (!result.destination) return;

        const sourceDate = result.source.droppableId;
        const destDate = result.destination.droppableId;

        if (sourceDate === destDate && result.source.index === result.destination.index) return;

        // Find the moved task from the source group
        const sourceTasks = groupedTasks[sourceDate];
        const [movedTask] = sourceTasks.splice(result.source.index, 1);

        movedTask.date = destDate; // update to new group date

        // Insert into destination group
        groupedTasks[destDate] = groupedTasks[destDate] || [];
        groupedTasks[destDate].splice(result.destination.index, 0, movedTask);

        // Flatten groupedTasks back into tasks array
        const updatedTasks = Object.values(groupedTasks).flat();
        setTasks(updatedTasks);

        // In handleDragEnd function
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
            fetch(`http://localhost:5000/api/update-task/${movedTask.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: new Date(destDate).toISOString().split("T")[0], // MySQL-friendly format
                    time: movedTask.time
                })
            })
                .then(res => res.json())
                .then(data => {
                    if (!data.success) {
                        console.error("Update failed:", data.message);
                        fetchTasks(); // refresh if failed
                    } else {
                        fetchTasks(); // refresh if successful
                    }
                })
                .catch(err => console.error("Error updating task:", err));
        }, 800);

    };

    const toggleDateExpand = (date) => {
        setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
    };

    const openDetails = (task) => {
        setSelectedTask(task);
        setShowDetails(true);
    };

    const closeDetails = () => {
        setSelectedTask(null);
        setShowDetails(false);
    };

    const openModal = (mode, task = null) => {
        setModalMode(mode);
        if (mode === "edit" && task) {
            setTaskForm({
                title: task.title,
                description: task.description,
                category: task.category,
                date: task.date,
                date: task.date || today,
                time: task.time,
                priority: task.priority
            });
            setSelectedTask(task);
        } else {
            setTaskForm({
                title: "",
                description: "",
                category: "",
                date: today,
                time: "",
                priority: "Medium"
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setTaskForm(prev => ({ ...prev, [name]: value }));
    };

    const saveTask = () => {
        const url = modalMode === "add"
            ? "http://localhost:5000/api/add-task"
            : `http://localhost:5000/api/edit-task/${selectedTask.id}`;

        fetch(url, {
            method: modalMode === "add" ? "POST" : "PUT", // use PUT for updates
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: taskForm.title,
                description: taskForm.description,
                category: taskForm.category,
                date: new Date(taskForm.date).toISOString().split("T")[0],
                time: taskForm.time,
                priority: taskForm.priority,
                user_id: localStorage.getItem("uid"),
                done: modalMode === "edit" ? selectedTask.done : 0
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    fetchTasks();
                    closeModal();
                } else {
                    console.error("Save failed:", data.message);
                }
            })
            .catch(err => console.error("Error saving task:", err));
    };


    const markAsDone = () => {
        if (!selectedTask || !selectedTask.id) {
            console.error("Invalid task selected for marking as done");
            return;
        }

        fetch(`http://localhost:5000/api/mark-done/${selectedTask.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ done: true }) // boolean, not int
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    fetchTasks(); // reload tasks
                    closeDetails();
                } else {
                    console.error("Mark as done failed:", data.message);
                }
            })
            .catch(err => console.error("Request error:", err));
    };


    const deleteTask = () => {
        fetch(`http://localhost:5000/api/delete-task/${selectedTask.id}`, {
            method: "DELETE"
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    fetchTasks();
                    closeDetails();
                }
            })
            .catch(err => console.error(err));
    };

    // Chatbot

    // Chat states
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [messageSent, setMessageSent] = useState(false);
    const messagesEndRef = useRef(null);

    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && message.trim() !== '') {
            event.preventDefault();
            handleSend();
        }
    };

    const adjustTextAreaHeight = (element) => {
        element.style.height = 'auto';
        if (element.value === '') {
            element.style.height = '20px';
        } else {
            element.style.height = `${element.scrollHeight}px`;
        }
    };

    const copyMessage = (htmlMessage) => {
        const tempElement = document.createElement('div');
        tempElement.innerHTML = htmlMessage;
        const plainText = tempElement.innerText || tempElement.textContent;
        navigator.clipboard.writeText(plainText)
            .then(() => alert('Message copied to clipboard!'))
            .catch((error) => console.error('Error copying message:', error));
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);


    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    function markdownToHtml(markdown) {
        return markdown
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    const handleSend = async (customMessage = null) => {
  if (loading || (message.trim() === '' && !customMessage)) {
    return;
  }

  const finalMessage = customMessage || message;

  // push user message
  setMessages(prev => [
    ...prev,
    { text: finalMessage, sender: "user", id: Date.now().toString() },
  ]);
  setMessage('');
  setLoading(true);

  try {
    const res = await fetch("http://localhost:5000/api/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: finalMessage, user_id: localStorage.getItem("uid") }),
    });

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const data = await res.json();

    if (data && data.reply) {
      const botMessage = {
        sender: "bot",
        html: markdownToHtml(data.reply),
        id: Date.now().toString(),
      };
      setMessages(prev => [...prev, botMessage]);
    }
  } catch (err) {
    console.error("Error sending message:", err);
  } finally {
    setLoading(false);
  }
};









    return (
        <div className="main-div">
            <div className={showDetails ? "logs-left section-shrink-left" : "logs-left"}>
                <div className="task-list-section" style={{ width: showDetails ? "45%" : "100%" }}>
                    <button onClick={() => openModal("add")} className="add-task-button">Add Task</button>
                    <div className="task-list-container">
                        <div className="task-header">
                            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                                <option value="all">All</option>
                                <option value="day">Day</option>
                                <option value="week">Week</option>
                            </select>
                        </div>
                        <div className="task-item-list" >
                            <DragDropContext onDragEnd={handleDragEnd}>
                                {Object.keys(groupedTasks).sort((a, b) => new Date(a) - new Date(b)).map(date => (
                                    <Droppable key={date} droppableId={date}>
                                        {(provided) => (
                                            <div {...provided.droppableProps} ref={provided.innerRef} className="task-group">
                                                <div className="task-date" onClick={() => toggleDateExpand(date)}>
                                                    <p>{new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "long" })}</p>
                                                    <img src="/icons/down.webp" style={expandedDates[date] ? { transform: "rotate(180deg)" } : { transform: "rotate(0deg)" }} alt="Expand" />
                                                </div>
                                                {expandedDates[date] && groupedTasks[date].map((task, index) => (

                                                    <Draggable key={task.id.toString()} draggableId={task.id.toString()} index={index}>
                                                        {(provided) => (
                                                            <div
                                                                className={`task-item ${new Date(date) < new Date(today) ? "greyed" : ""}`}
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                            >
                                                                <p>{task.title}</p>
                                                                <img
                                                                    src="/icons/view1.webp"
                                                                    alt="View"
                                                                    className="view-icon"
                                                                    onClick={() => {
                                                                        if (showDetails && selectedTask && selectedTask.id === task.id) {
                                                                            closeDetails();
                                                                        } else {
                                                                            openDetails(task);
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        transform: showDetails && selectedTask && selectedTask.id === task.id ? "rotateY(180deg)" : "rotateY(0deg)"
                                                                    }}
                                                                />
                                                            </div>
                                                        )}
                                                    </Draggable>

                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                ))}
                            </DragDropContext>
                        </div>
                    </div>
                </div>

                {selectedTask && (
                    <div className={showDetails ? "task-details-visible" : "task-details-hidden"}>
                        <div className="details-buttons">
                            {selectedTask.done !== 1 && (
                                <img src="./icons/read.webp" alt="Done" onClick={markAsDone} />
                            )}
                            <img src="./icons/edit.webp" alt="Edit" onClick={() => openModal("edit", selectedTask)} />
                            <img src="./icons/delete.webp" alt="Delete" onClick={deleteTask} />
                            <img src="./icons/cancel.webp" alt="Close" onClick={closeDetails} />
                        </div>
                        <div className="task-details">
                            <h2>{selectedTask.title}</h2>
                            <p className="task-details-date">{new Date(selectedTask.date).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric"
                            })} - {selectedTask.time}</p>
                            <div>
                                {selectedTask.category.split(",").map(catName => {
                                    const preset = presetCategories.find(p => p.name === catName.trim());
                                    return (
                                        <span
                                            key={catName}
                                            style={{
                                                backgroundColor: preset ? preset.color : "#ddd",
                                                color: "#fff",
                                                padding: "3px 8px",
                                                marginRight: "5px",
                                                borderRadius: "10px",
                                                fontSize: "14px"
                                            }}
                                        >
                                            {catName}
                                        </span>
                                    );
                                })}
                            </div>
                            <h4><strong style={{ fontSize: "18px" }}>Description:</strong><br /> {selectedTask.description}</h4>



                            <h4><strong style={{ fontSize: "18px" }}>Priority:</strong><br /> {selectedTask.priority}</h4>
                        </div>

                    </div>
                )}
            </div>

            <div className={showDetails ? "logs-right section-shrink-right" : "logs-right"}>
                <div className='main-div-chatbot' id='style-1'>
                    {messages.map((item, index) => (
                        <div key={item.id || index} className="messages-container">
                            <div style={{ display: 'flex', marginTop: 10 }}>
                                <div className={item.sender === 'user' ? 'user-message' : 'bot-message'}>
                                    {item.sender === 'user' && (<img src="icons/user.webp" alt="User" className="bot-icon" />)}
                                    {item.sender === 'bot' && (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <img src="images/bot.webp" className="bot-icon" />
                                            <img src="images/copy-icon1.webp" alt="Copy" className='copy-icon' onClick={() => copyMessage(item.html)} />
                                        </div>
                                    )}
                                    {item.sender === 'user'
                                        ? <p className='message-text'>{item.text}</p>
                                        : <p className='message-text' dangerouslySetInnerHTML={{ __html: item.html }} />}
                                </div>
                            </div>

                            {item.sender === 'user' && loading && index === messages.length - 1 && (
                                <div className="card">
                                    <div className="card__skeleton card__title"></div>
                                    <div className="card__skeleton card__description"></div>
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={messagesEndRef}></div>
                </div>

                {/* Chat Input */}
                <div className='fixed-bottom'>
                    <div className="chat-input-container">
                        <textarea
                            placeholder='Ask a question'
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onInput={(e) => adjustTextAreaHeight(e.target)}
                            onKeyPress={handleKeyPress}
                            className="chat-input"
                            style={{ height: 20 }}
                        />

                        <img className="send-icon"
                            onClick={() => {
                                handleSend();
                            }}
                            disabled={loading}
                            style={{ opacity: loading ? 0.5 : 1, marginLeft: 10 }}
                            src="./icons/send.webp"
                            alt="Send" />

                    </div>
                    <p className='bottom-text'>"Chatbots input is typically beneficial, but it's advisable to confirm its accuracy."</p>
                </div>

            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>{modalMode === "add" ? "Add Task" : "Edit Task"}</h2>
                        <input name="title" value={taskForm.title} onChange={handleFormChange} placeholder="Title" />
                        <textarea name="description" value={taskForm.description} onChange={handleFormChange} placeholder="Description"></textarea>
                        <input name="category" value={taskForm.category} onChange={handleFormChange} placeholder="Category" />
                        <div className="preset-categories">
                            {presetCategories.map(cat => {
                                const isChecked = taskForm.category.split(",").includes(cat.name);
                                return (
                                    <label
                                        key={cat.name}
                                        style={{
                                            backgroundColor: isChecked ? cat.color : "#f0f0f0",
                                            color: isChecked ? "#fff" : "#000",
                                            padding: "5px 10px",
                                            borderRadius: "12px",
                                            margin: "5px",
                                            display: "inline-block",
                                            cursor: "pointer"
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => handleCategoryToggle(cat.name)}
                                            style={{ display: "none" }}
                                        />
                                        {cat.name}
                                    </label>
                                );
                            })}
                        </div>

                        <input type="date" name="date" value={taskForm.date} onChange={handleFormChange} />
                        <input type="time" name="time" value={taskForm.time} onChange={handleFormChange} />
                        <select name="priority" value={taskForm.priority} onChange={handleFormChange}>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                        </select>
                        <div className="modal-buttons">
                            <button onClick={saveTask}>Save</button>
                            <button onClick={closeModal}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
