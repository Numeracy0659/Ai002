#include <jni.h>

#include <cerrno>
#include <csignal>
#include <cstring>
#include <fcntl.h>
#include <poll.h>
#include <sys/ioctl.h>
#include <sys/prctl.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

#include <algorithm>
#include <string>

namespace {
struct PtySession {
  int master = -1;
  pid_t process_group = -1;
};

PtySession* fromHandle(jlong handle) {
  return reinterpret_cast<PtySession*>(handle);
}

bool validSize(jint rows, jint columns) {
  return rows > 0 && rows <= 200 && columns > 0 && columns <= 400;
}

bool validSignal(jint signal) {
  return signal == SIGINT || signal == SIGTERM || signal == SIGKILL || signal == SIGHUP;
}

void closeFd(int* fd) {
  if (*fd >= 0) {
    close(*fd);
    *fd = -1;
  }
}
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_app_codeforgemobile_PtyNative_create(JNIEnv* env, jclass, jstring cwd, jint rows, jint columns) {
  if (cwd == nullptr || !validSize(rows, columns)) return 0;
  const char* cwdChars = env->GetStringUTFChars(cwd, nullptr);
  if (cwdChars == nullptr) return 0;
  const std::string workingDirectory(cwdChars);
  env->ReleaseStringUTFChars(cwd, cwdChars);

  const int master = posix_openpt(O_RDWR | O_NOCTTY | O_CLOEXEC);
  if (master < 0 || grantpt(master) != 0 || unlockpt(master) != 0) {
    int fd = master;
    closeFd(&fd);
    return 0;
  }

  char slaveName[128] = {};
  if (ptsname_r(master, slaveName, sizeof(slaveName)) != 0) {
    int fd = master;
    closeFd(&fd);
    return 0;
  }

  struct winsize size = {};
  size.ws_row = static_cast<unsigned short>(rows);
  size.ws_col = static_cast<unsigned short>(columns);
  if (ioctl(master, TIOCSWINSZ, &size) != 0) {
    int fd = master;
    closeFd(&fd);
    return 0;
  }

  const pid_t child = fork();
  if (child < 0) {
    int fd = master;
    closeFd(&fd);
    return 0;
  }
  if (child == 0) {
    prctl(PR_SET_PDEATHSIG, SIGKILL);
    if (setsid() < 0) _exit(126);
    const int slave = open(slaveName, O_RDWR | O_NOCTTY);
    if (slave < 0 || ioctl(slave, TIOCSCTTY, 0) != 0) _exit(126);
    if (dup2(slave, STDIN_FILENO) < 0 || dup2(slave, STDOUT_FILENO) < 0 || dup2(slave, STDERR_FILENO) < 0) _exit(126);
    if (slave > STDERR_FILENO) close(slave);
    close(master);
    if (chdir(workingDirectory.c_str()) != 0) _exit(126);
    clearenv();
    setenv("HOME", workingDirectory.c_str(), 1);
    setenv("PATH", "/system/bin:/system/xbin", 1);
    setenv("TERM", "xterm-256color", 1);
    setenv("LANG", "C.UTF-8", 1);
    execl("/system/bin/sh", "sh", static_cast<char*>(nullptr));
    _exit(127);
  }

  int flags = fcntl(master, F_GETFL, 0);
  if (flags < 0 || fcntl(master, F_SETFL, flags | O_NONBLOCK) != 0) {
    kill(child, SIGKILL);
    waitpid(child, nullptr, 0);
    int fd = master;
    closeFd(&fd);
    return 0;
  }
  auto* session = new PtySession{master, child};
  return reinterpret_cast<jlong>(session);
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_app_codeforgemobile_PtyNative_read(JNIEnv* env, jclass, jlong handle, jint maxBytes) {
  PtySession* session = fromHandle(handle);
  if (session == nullptr || session->master < 0 || maxBytes <= 0 || maxBytes > 65536) return nullptr;
  jbyte buffer[4096];
  const ssize_t count = read(session->master, buffer, std::min(maxBytes, static_cast<jint>(sizeof(buffer))));
  if (count > 0) {
    jbyteArray result = env->NewByteArray(static_cast<jsize>(count));
    env->SetByteArrayRegion(result, 0, static_cast<jsize>(count), buffer);
    return result;
  }
  if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return env->NewByteArray(0);
  return nullptr;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_app_codeforgemobile_PtyNative_write(JNIEnv* env, jclass, jlong handle, jbyteArray bytes) {
  PtySession* session = fromHandle(handle);
  if (session == nullptr || session->master < 0 || bytes == nullptr) return -1;
  const jsize length = env->GetArrayLength(bytes);
  if (length <= 0 || length > 65536) return -1;
  jbyte buffer[65536];
  env->GetByteArrayRegion(bytes, 0, length, buffer);
  const ssize_t written = write(session->master, buffer, static_cast<size_t>(length));
  if (written >= 0) return static_cast<jint>(written);
  return (errno == EAGAIN || errno == EWOULDBLOCK) ? 0 : -1;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_app_codeforgemobile_PtyNative_resize(JNIEnv*, jclass, jlong handle, jint rows, jint columns) {
  PtySession* session = fromHandle(handle);
  if (session == nullptr || session->master < 0 || !validSize(rows, columns)) return JNI_FALSE;
  struct winsize size = {};
  size.ws_row = static_cast<unsigned short>(rows);
  size.ws_col = static_cast<unsigned short>(columns);
  if (ioctl(session->master, TIOCSWINSZ, &size) != 0) return JNI_FALSE;
  if (session->process_group > 1) kill(-session->process_group, SIGWINCH);
  return JNI_TRUE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_app_codeforgemobile_PtyNative_signal(JNIEnv*, jclass, jlong handle, jint signal) {
  PtySession* session = fromHandle(handle);
  if (session == nullptr || session->process_group <= 1 || !validSignal(signal)) return JNI_FALSE;
  return kill(-session->process_group, signal) == 0 ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_app_codeforgemobile_PtyNative_waitForExit(JNIEnv*, jclass, jlong handle) {
  PtySession* session = fromHandle(handle);
  if (session == nullptr || session->process_group <= 1) return -1;
  int status = 0;
  if (waitpid(session->process_group, &status, 0) < 0) return -1;
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return -1;
}

extern "C" JNIEXPORT void JNICALL
Java_com_app_codeforgemobile_PtyNative_close(JNIEnv*, jclass, jlong handle) {
  PtySession* session = fromHandle(handle);
  if (session == nullptr) return;
  if (session->process_group > 1) {
    kill(-session->process_group, SIGTERM);
    usleep(100000);
    kill(-session->process_group, SIGKILL);
    waitpid(session->process_group, nullptr, 0);
  }
  closeFd(&session->master);
  delete session;
}
