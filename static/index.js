document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const elements = {
    audioPlayer: document.getElementById('audioPlayer'),
    transcript: document.getElementById('transcript'),
    timeDisplay: document.getElementById('time-display'),
    editableTranscript: document.getElementById('editable-transcript'),
    submitButton: document.getElementById('submit'),
    scoreModalBody: document.getElementById('score-modal-body'),
  };

  // State management
  const state = {
    socket: null,
    lastTime: -1,
    transcriptHistory: [], // Store transcript segments
  };

  // Initialize WebSocket connection
  const initializeWebSocket = () => {
    state.socket = io();

    state.socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    state.socket.on('transcription_segment', data => {
      updateTranscriptDisplay(data);
      updateEditableTranscript(data);
    });

    state.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  };

  // Utility functions
  const formatTime = time => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  };

  const updateTranscriptDisplay = data => {
    if (!data.text) return;

    // Add new segment to history if it's not already there
    const newSegment = `[${formatTime(data.start)}] ${data.text}`;
    if (!state.transcriptHistory.includes(newSegment)) {
      state.transcriptHistory.push(newSegment);

      // Update read-only transcript
      elements.transcript.value = state.transcriptHistory.join('\n');

      // Auto-scroll
      elements.transcript.scrollTop = elements.transcript.scrollHeight;
    }
  };

  const updateEditableTranscript = data => {
    if (!data.text || elements.editableTranscript.value.endsWith(data.text)) return;

    // Save current state
    const cursorPosition = elements.editableTranscript.selectionStart;
    const cursorEnd = elements.editableTranscript.selectionEnd;
    const scrollTop = elements.editableTranscript.scrollTop;
    const wasAtBottom =
      scrollTop + elements.editableTranscript.clientHeight === elements.editableTranscript.scrollHeight;

    // Update content
    let newValue = elements.editableTranscript.value;
    if (newValue) newValue += '\n';
    newValue += data.text;

    elements.editableTranscript.value = newValue;

    // Restore cursor position or keep at end
    if (cursorPosition !== elements.editableTranscript.value.length - data.text.length - 1) {
      elements.editableTranscript.setSelectionRange(cursorPosition, cursorEnd);
      elements.editableTranscript.scrollTop = scrollTop;
    } else {
      elements.editableTranscript.setSelectionRange(newValue.length, newValue.length);
      if (wasAtBottom) {
        elements.editableTranscript.scrollTop = elements.editableTranscript.scrollHeight;
      }
    }
  };

  // Audio Player Event Handlers
  const handleTimeUpdate = () => {
    const currentTime = elements.audioPlayer.currentTime;
    elements.timeDisplay.textContent = formatTime(currentTime);

    if (Math.abs(currentTime - state.lastTime) >= 0.1) {
      state.lastTime = currentTime;
      state.socket.emit('request_transcription', {
        currentTime: currentTime,
      });
    }
  };

  // Initialize Audio Player
  if (elements.audioPlayer) {
    elements.audioPlayer.addEventListener('play', () => {
      elements.audioPlayer.controls = false;
      state.socket.emit('request_transcription', {
        currentTime: elements.audioPlayer.currentTime,
        fileId: 1,
      });
    });

    elements.audioPlayer.addEventListener('ended', () => {
      elements.audioPlayer.controls = true;
    });

    elements.audioPlayer.addEventListener('timeupdate', handleTimeUpdate);
    elements.audioPlayer.addEventListener('seeking', () => {
      state.transcriptHistory = []; // Clear history when seeking
      elements.transcript.value = '';
    });

    elements.audioPlayer.addEventListener('seeked', () => {
      state.socket.emit('request_transcription', {
        currentTime: elements.audioPlayer.currentTime,
        fileId: 1,
      });
    });
  }

  // Initialize WebSocket connection
  initializeWebSocket();

  // Initialize the modal
  const modal = new Modal(document.getElementById('score-results-modal'));

  // Add event listener for the close button
  const closeModalButton = document.getElementById('close-modal-button');
  if (closeModalButton) {
    closeModalButton.addEventListener('click', () => {
      modal.hide();
    });
  }
  // Cleanup
  window.addEventListener('beforeunload', () => {
    if (state.socket) {
      state.socket.disconnect();
    }
  });

  const stopAudio = () => {
    elements.audioPlayer.pause();
  };

  const extractScore = (text, category) => {
    const regex = new RegExp(`${category}:\\s*(\\d+)(?:/100)?`, 'i');
    const match = text.match(regex);
    return match ? match[1] : 'N/A';
  };
  
  const generateScoreBreakdown = (gpt4_score) => {
    const categories = ['Audio cues', 'Corrections in terms of words', 'Punctuation', 'Grammar'];
    return categories.map(category => 
      `<p><strong>${category}:</strong> ${extractScore(gpt4_score, category)}/100</p>`
    ).join('');
  };
  
  const extractOverallScore = (gpt4_score) => {
    const match = gpt4_score.match(/Overall score:\s*(\d+(?:\.\d+)?)/i);
    return match ? match[1] : 'N/A';
  };

  // Score Submission
  elements.submitButton.addEventListener('click', e => {
    e.preventDefault();
    stopAudio();
    modal.show();

    if (!elements.editableTranscript.value) {
      alert('Empty submission!');
    }

    const data = {
      transcript: elements.editableTranscript.value,
    };

    fetch('/transcription/score-transcription/1', {
      //TODO replace with actual API endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
      .then(response => response.json())
      .then(data => {
        console.log(data);

               const scoreHTML = `
          <div class="score-results">
            <h3>Scoring Results</h3>
            <div class="score-breakdown">
              ${generateScoreBreakdown(data.gpt4_score)}
            </div>
            <h4>Overall Score: ${extractOverallScore(data.gpt4_score)}</h4>
            <div class="explanation">
              <h5>Explanation:</h5>
              <p>${data.gpt4_score.split('\n\n').pop()}</p>
            </div>
          </div>
        `;
        elements.scoreModalBody.innerHTML = scoreHTML;
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Error scoring the transcript!');
      });
  });
});
