from app import db, login
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from datetime import datetime

@login.user_loader
def load_user(id):
    return User.query.get(int(id))

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), index=True, unique=True)
    password_hash = db.Column(db.String(256))
    # MODIFICATION: Added server_default for database-level defaulting
    timezone = db.Column(db.String(64), nullable=False, default='UTC', server_default='UTC')
    girls = db.relationship('Girl', backref='owner', lazy='dynamic', cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Girl(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    plots = db.relationship('Plot', backref='girl', lazy='dynamic', cascade="all, delete-orphan")

class Plot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    hot_score = db.Column(db.Float, nullable=False)
    crazy_score = db.Column(db.Float, nullable=False)
    notes = db.Column(db.Text)
    plot_date = db.Column(db.DateTime, index=True, default=datetime.utcnow)
    girl_id = db.Column(db.Integer, db.ForeignKey('girl.id'))
