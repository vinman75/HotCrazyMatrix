from flask import Blueprint, render_template, jsonify, request, abort
from flask_login import login_required, current_user
from app import db
from app.models import Girl, Plot
from sqlalchemy import func
from datetime import datetime
import re

bp = Blueprint('main', __name__)

# --- Helper for Validation ---
def validate_plot_data(data, is_update=False):
    """Validates incoming plot data for create and update operations."""
    errors = {}
    if not is_update:
        if 'girl_id' not in data:
            errors['girl_id'] = "girl_id is required."
    
    # Validate scores
    hot_score = data.get('hot_score')
    crazy_score = data.get('crazy_score')

    try:
        if hot_score is not None:
            hot_score = float(hot_score)
            if not (0 <= hot_score <= 10):
                errors['hot_score'] = "Hot score must be between 0 and 10."
    except (ValueError, TypeError):
        errors['hot_score'] = "Hot score must be a valid number."

    try:
        if crazy_score is not None:
            crazy_score = float(crazy_score)
            if not (4 <= crazy_score <= 10):
                errors['crazy_score'] = "Crazy score must be between 4 and 10."
    except (ValueError, TypeError):
        errors['crazy_score'] = "Crazy score must be a valid number."

    # Validate notes length
    if 'notes' in data and len(data['notes']) > 500:
        errors['notes'] = "Notes cannot exceed 500 characters."
        
    # Validate date format
    plot_date_str = data.get('plot_date')
    if plot_date_str:
        try:
            # A simple regex to check for ISO-like format before parsing
            if not re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d*)?)?(Z|[+-]\d{2}:\d{2})?$', plot_date_str):
                raise ValueError()
            datetime.fromisoformat(plot_date_str.replace('Z', '+00:00'))
        except (ValueError, TypeError):
            errors['plot_date'] = "Invalid date format. Please use ISO 8601 format."

    if errors:
        # Join errors into a single message
        error_message = "; ".join([f"{k}: {v}" for k, v in errors.items()])
        abort(400, description=error_message)


@bp.route('/')
@login_required
def dashboard():
    return render_template('dashboard.html', title='Dashboard')

# --- Girl CRUD ---
@bp.route('/api/girls', methods=['GET'])
@login_required
def get_girls():
    girls = Girl.query.filter_by(user_id=current_user.id).order_by(Girl.name).all()
    return jsonify([{'id': girl.id, 'name': girl.name} for girl in girls])

@bp.route('/api/girls', methods=['POST'])
@login_required
def create_girl():
    data = request.get_json() or {}
    if 'name' not in data or not data['name'].strip() or len(data['name']) > 120:
        abort(400, description="Name is required and must be less than 120 characters.")
    girl = Girl(name=data['name'].strip(), owner=current_user)
    db.session.add(girl)
    db.session.commit()
    return jsonify({'id': girl.id, 'name': girl.name}), 201

@bp.route('/api/girls/<int:id>', methods=['PUT'])
@login_required
def update_girl(id):
    girl = Girl.query.get_or_404(id)
    if girl.user_id != current_user.id: abort(403)
    data = request.get_json() or {}
    if 'name' not in data or not data['name'].strip() or len(data['name']) > 120:
        abort(400, description="Name is required and must be less than 120 characters.")
    girl.name = data['name'].strip()
    db.session.commit()
    return jsonify({'id': girl.id, 'name': girl.name})

@bp.route('/api/girls/<int:id>', methods=['DELETE'])
@login_required
def delete_girl(id):
    girl = Girl.query.get_or_404(id)
    if girl.user_id != current_user.id: abort(403)
    db.session.delete(girl)
    db.session.commit()
    return '', 204

# --- Plot CRUD ---
@bp.route('/api/girls/<int:girl_id>/plots', methods=['GET'])
@login_required
def get_plots(girl_id):
    girl = Girl.query.get_or_404(girl_id)
    if girl.user_id != current_user.id: abort(403)
    plots = girl.plots.order_by(Plot.plot_date.asc()).all()
    return jsonify([{
        'id': p.id, 'x': p.hot_score, 'y': p.crazy_score,
        'notes': p.notes, 'date': p.plot_date.isoformat()
    } for p in plots])

@bp.route('/api/plots', methods=['POST'])
@login_required
def create_plot():
    data = request.get_json() or {}
    validate_plot_data(data) # Run validation
    
    girl = Girl.query.get_or_404(data.get('girl_id'))
    if girl.user_id != current_user.id: abort(403)

    plot_date_str = data.get('plot_date')
    plot_date = datetime.fromisoformat(plot_date_str.replace('Z', '+00:00')) if plot_date_str else datetime.utcnow()
    
    plot = Plot(
        girl_id=girl.id, 
        hot_score=data.get('hot_score'),
        crazy_score=data.get('crazy_score'), 
        notes=data.get('notes', '').strip(),
        plot_date=plot_date
    )
    db.session.add(plot)
    db.session.commit()
    return jsonify({'id': plot.id}), 201

@bp.route('/api/plots/<int:id>', methods=['PUT'])
@login_required
def update_plot(id):
    plot = Plot.query.get_or_404(id)
    if plot.girl.user_id != current_user.id: abort(403)
    
    data = request.get_json() or {}
    validate_plot_data(data, is_update=True) # Run validation
    
    plot.hot_score = data.get('hot_score', plot.hot_score)
    plot.crazy_score = data.get('crazy_score', plot.crazy_score)
    plot.notes = data.get('notes', plot.notes).strip()
    plot_date_str = data.get('plot_date')
    if plot_date_str:
        plot.plot_date = datetime.fromisoformat(plot_date_str.replace('Z', '+00:00'))
    
    db.session.commit()
    return jsonify({'id': plot.id})

@bp.route('/api/plots/<int:id>', methods=['DELETE'])
@login_required
def delete_plot(id):
    plot = Plot.query.get_or_404(id)
    if plot.girl.user_id != current_user.id: abort(403)
    db.session.delete(plot)
    db.session.commit()
    return '', 204

# --- Average Calculation ---
@bp.route('/api/averages', methods=['GET'])
@login_required
def get_averages():
    girl_ids_str = request.args.get('girl_ids', '')
    if not girl_ids_str: return jsonify({})
    try:
        girl_ids = [int(id) for id in girl_ids_str.split(',')]
    except ValueError:
        abort(400, description="Invalid girl_ids format. Must be comma-separated integers.")
        
    valid_girls = Girl.query.filter(Girl.user_id == current_user.id, Girl.id.in_(girl_ids)).all()
    valid_girl_ids = {g.id for g in valid_girls}
    if not valid_girl_ids: return jsonify({})
    
    results = db.session.query(
        Plot.girl_id,
        func.avg(Plot.hot_score).label('avg_hot'),
        func.avg(Plot.crazy_score).label('avg_crazy')
    ).filter(Plot.girl_id.in_(valid_girl_ids)).group_by(Plot.girl_id).all()
    
    averages = {
        res.girl_id: {'avg_hot': round(res.avg_hot, 2), 'avg_crazy': round(res.avg_crazy, 2)}
        for res in results
    }
    return jsonify(averages)