'use strict';

const API_URL = 'https://jsonplaceholder.typicode.com/users';

const loadButton = document.querySelector('#load-users');
const filterInput = document.querySelector('#filter-input');
const statusText = document.querySelector('#status');
const usersList = document.querySelector('#users-list');

let users = [];

function setStatus(message) {
  statusText.textContent = message;
}

function createLine(label, value) {
  const line = document.createElement('p');
  line.textContent = `${label}: ${value}`;
  return line;
}

function renderUsers(list) {
  usersList.replaceChildren();

  list.forEach((user) => {
    const item = document.createElement('li');

    const name = document.createElement('strong');
    name.textContent = user.name;

    item.append(
      name,
      createLine('Email', user.email),
      createLine('City', user.address.city),
      createLine('Company', user.company.name)
    );

    usersList.appendChild(item);
  });
}

async function loadUsers() {
  loadButton.disabled = true;
  setStatus('Loading users...');

  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    users = await response.json();

    applyFilter();
    setStatus(`Loaded ${users.length} users.`);
  } catch (error) {
    setStatus(`Error: ${error.message}. Please try again.`);
  } finally {
    loadButton.disabled = false;
  }
}

function applyFilter() {
  const term = filterInput.value.trim().toLowerCase();

  const matches = users.filter((user) =>
    user.name.toLowerCase().includes(term)
  );

  renderUsers(matches);
  return matches.length;
}

function handleFilter() {
  if (users.length === 0) return;

  const count = applyFilter();
  if (count === 0) {
    setStatus('No users match your filter.');
  } else {
    setStatus(`Showing ${count} of ${users.length} users.`);
  }
}

loadButton.addEventListener('click', loadUsers);
filterInput.addEventListener('input', handleFilter);
