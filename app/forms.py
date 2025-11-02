from flask_wtf import FlaskForm
from wtforms import BooleanField, PasswordField, StringField, SubmitField, SelectField
from wtforms.validators import DataRequired, EqualTo, Length, ValidationError
import pytz

from app.models import User


class LoginForm(FlaskForm):
    username = StringField(
        "Username",
        validators=[DataRequired(), Length(max=64, message="Username cannot exceed 64 characters.")],
    )
    password = PasswordField("Password", validators=[DataRequired()])
    remember_me = BooleanField("Remember Me")
    submit = SubmitField("Sign In")


class RegistrationForm(FlaskForm):
    username = StringField(
        "Username",
        validators=[DataRequired(), Length(max=64, message="Username cannot exceed 64 characters.")],
    )
    password = PasswordField("Password", validators=[DataRequired()])
    password2 = PasswordField(
        "Repeat Password", validators=[DataRequired(), EqualTo("password")]
    )
    submit = SubmitField("Register")

    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user is not None:
            raise ValidationError("Please use a different username.")

    def validate_password(self, password):
        if len(password.data or "") < 8:
            raise ValidationError("Password must be at least 8 characters long.")


class DeleteAccountForm(FlaskForm):
    password = PasswordField("Password", validators=[DataRequired()])
    submit = SubmitField("Delete My Account Permanently")

class SettingsForm(FlaskForm):
    timezone = SelectField('Timezone', choices=[(tz, tz) for tz in pytz.all_timezones], validators=[DataRequired()])
    submit = SubmitField('Save Settings')