from django.urls import path

from accounts.views import LoginView, LogoutView, SessionView, SignupView

app_name = "accounts"

urlpatterns = [
    path("session/", SessionView.as_view(), name="session"),
    path("signup/", SignupView.as_view(), name="signup"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
]
