package com.app.codeforgemobile

/** Versioned contract shared by the Android terminal owner and its UI adapter. */
object TerminalContract {
  const val VERSION = 1
  const val MAX_INPUT_BYTES = 64 * 1024
  const val MAX_OUTPUT_BYTES = 1024 * 1024
  const val MAX_ROWS = 200
  const val MAX_COLUMNS = 400

  enum class State { NEW, STARTING, RUNNING, STOPPING, EXITED, FAILED, LOST }

  enum class Event { START_REQUESTED, STARTED, STOP_REQUESTED, EXITED, FAILED, HOST_LOST }

  fun transition(state: State, event: Event): State? = when (state to event) {
    State.NEW to Event.START_REQUESTED -> State.STARTING
    State.STARTING to Event.STARTED -> State.RUNNING
    State.STARTING to Event.FAILED -> State.FAILED
    State.RUNNING to Event.STOP_REQUESTED -> State.STOPPING
    State.RUNNING to Event.EXITED -> State.EXITED
    State.RUNNING to Event.FAILED -> State.FAILED
    State.RUNNING to Event.HOST_LOST -> State.LOST
    State.STOPPING to Event.EXITED -> State.EXITED
    State.STOPPING to Event.FAILED -> State.FAILED
    else -> null
  }

  fun validateSize(rows: Int, columns: Int): Boolean = rows in 1..MAX_ROWS && columns in 1..MAX_COLUMNS
}
