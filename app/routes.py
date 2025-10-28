from datetime import datetime
import re

from flask import Blueprint, abort, jsonify, render_template, request
from flask_login import current_user, login_required
from sqlalchemy import func

from app import db
from app.models import Girl, Plot


bp = Blueprint("main", __name__)


# --- Helper for Validation ---
def validate_plot_data(data, *, is_update: bool = False):
    """Validate incoming plot payloads for create and update operations."""
    errors = {}
    cleaned = {}

    if not is_update and "girl_id" not in data:
        errors["girl_id"] = "girl_id is required."

    # Validate scores
    raw_hot_score = data.get("hot_score")
    raw_crazy_score = data.get("crazy_score")

    if raw_hot_score is None:
        if not is_update:
            errors["hot_score"] = "Hot score is required."
    else:
        try:
            hot_score = float(raw_hot_score)
        except (TypeError, ValueError):
            errors["hot_score"] = "Hot score must be a valid number."
        else:
            if not 0 <= hot_score <= 10:
                errors["hot_score"] = "Hot score must be between 0 and 10."
            else:
                cleaned["hot_score"] = hot_score

    if raw_crazy_score is None:
        if not is_update:
            errors["crazy_score"] = "Crazy score is required."
    else:
        try:
            crazy_score = float(raw_crazy_score)
        except (TypeError, ValueError):
            errors["crazy_score"] = "Crazy score must be a valid number."
        else:
            if not 4 <= crazy_score <= 10:
                errors["crazy_score"] = "Crazy score must be between 4 and 10."
            else:
                cleaned["crazy_score"] = crazy_score

    # Validate notes length/type
    if "notes" in data:
        notes = data["notes"]
        if notes is None:
            cleaned["notes"] = None
        elif not isinstance(notes, str):
            errors["notes"] = "Notes must be a string."
        else:
            trimmed_notes = notes.strip()
            if len(trimmed_notes) > 500:
                errors["notes"] = "Notes cannot exceed 500 characters."
            else:
                cleaned["notes"] = trimmed_notes

    # Validate date format if provided
    plot_date_str = data.get("plot_date")
    if plot_date_str:
        try:
            if not re.match(
                r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d*)?)?(Z|[+-]\d{2}:\d{2})?$",
                plot_date_str,
            ):
                raise ValueError
            datetime.fromisoformat(plot_date_str.replace("Z", "+00:00"))
        except (TypeError, ValueError):
            errors["plot_date"] = "Invalid date format. Please use ISO 8601 format."

    if errors:
        error_message = "; ".join(f"{field}: {message}" for field, message in errors.items())
        abort(400, description=error_message)

    return cleaned


@bp.route("/")
@login_required
def dashboard():
    return render_template("dashboard.html", title="Dashboard")


# --- Girl CRUD ---
@bp.route("/api/girls", methods=["GET"])
@login_required
def get_girls():
    girls = Girl.query.filter_by(user_id=current_user.id).order_by(Girl.name).all()
    return jsonify([{"id": girl.id, "name": girl.name} for girl in girls])


@bp.route("/api/girls", methods=["POST"])
@login_required
def create_girl():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name or len(name) > 120:
        abort(400, description="Name is required and must be less than 120 characters.")

    girl = Girl(name=name, owner=current_user)
    db.session.add(girl)
    db.session.commit()
    return jsonify({"id": girl.id, "name": girl.name}), 201


@bp.route("/api/girls/<int:girl_id>", methods=["PUT"])
@login_required
def update_girl(girl_id):
    girl = Girl.query.get_or_404(girl_id)
    if girl.user_id != current_user.id:
        abort(403)

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name or len(name) > 120:
        abort(400, description="Name is required and must be less than 120 characters.")

    girl.name = name
    db.session.commit()
    return jsonify({"id": girl.id, "name": girl.name})


@bp.route("/api/girls/<int:girl_id>", methods=["DELETE"])
@login_required
def delete_girl(girl_id):
    girl = Girl.query.get_or_404(girl_id)
    if girl.user_id != current_user.id:
        abort(403)

    db.session.delete(girl)
    db.session.commit()
    return "", 204


# --- Plot CRUD ---
@bp.route("/api/girls/<int:girl_id>/plots", methods=["GET"])
@login_required
def get_plots(girl_id):
    girl = Girl.query.get_or_404(girl_id)
    if girl.user_id != current_user.id:
        abort(403)

    plots = girl.plots.order_by(Plot.plot_date.asc()).all()
    return jsonify(
        [
            {
                "id": plot.id,
                "x": plot.hot_score,
                "y": plot.crazy_score,
                "notes": plot.notes,
                "date": plot.plot_date.isoformat(),
            }
            for plot in plots
        ]
    )


@bp.route("/api/plots", methods=["POST"])
@login_required
def create_plot():
    data = request.get_json() or {}
    cleaned = validate_plot_data(data, is_update=False)

    girl = Girl.query.get_or_404(data.get("girl_id"))
    if girl.user_id != current_user.id:
        abort(403)

    plot_date_str = data.get("plot_date")
    plot_date = (
        datetime.fromisoformat(plot_date_str.replace("Z", "+00:00"))
        if plot_date_str
        else datetime.utcnow()
    )

    notes = cleaned.get("notes") if "notes" in cleaned else None

    plot = Plot(
        girl_id=girl.id,
        hot_score=cleaned["hot_score"],
        crazy_score=cleaned["crazy_score"],
        notes=notes,
        plot_date=plot_date,
    )
    db.session.add(plot)
    db.session.commit()
    return jsonify({"id": plot.id}), 201


@bp.route("/api/plots/<int:plot_id>", methods=["PUT"])
@login_required
def update_plot(plot_id):
    plot = Plot.query.get_or_404(plot_id)
    if plot.girl.user_id != current_user.id:
        abort(403)

    data = request.get_json() or {}
    cleaned = validate_plot_data(data, is_update=True)

    if "hot_score" in cleaned:
        plot.hot_score = cleaned["hot_score"]
    if "crazy_score" in cleaned:
        plot.crazy_score = cleaned["crazy_score"]

    if "notes" in cleaned:
        plot.notes = cleaned["notes"]
    elif "notes" in data and data["notes"] is None:
        plot.notes = None

    plot_date_str = data.get("plot_date")
    if plot_date_str:
        plot.plot_date = datetime.fromisoformat(plot_date_str.replace("Z", "+00:00"))

    db.session.commit()
    return jsonify({"id": plot.id})


@bp.route("/api/plots/<int:plot_id>", methods=["DELETE"])
@login_required
def delete_plot(plot_id):
    plot = Plot.query.get_or_404(plot_id)
    if plot.girl.user_id != current_user.id:
        abort(403)

    db.session.delete(plot)
    db.session.commit()
    return "", 204


# --- Average Calculation ---
@bp.route("/api/averages", methods=["GET"])
@login_required
def get_averages():
    girl_ids_str = request.args.get("girl_ids", "")
    if not girl_ids_str:
        return jsonify({})

    try:
        girl_ids = [int(item) for item in girl_ids_str.split(",") if item]
    except ValueError:
        abort(400, description="Invalid girl_ids format. Must be comma-separated integers.")

    valid_girls = Girl.query.filter(
        Girl.user_id == current_user.id,
        Girl.id.in_(girl_ids),
    ).all()
    valid_girl_ids = {girl.id for girl in valid_girls}
    if not valid_girl_ids:
        return jsonify({})

    results = (
        db.session.query(
            Plot.girl_id,
            func.avg(Plot.hot_score).label("avg_hot"),
            func.avg(Plot.crazy_score).label("avg_crazy"),
        )
        .filter(Plot.girl_id.in_(valid_girl_ids))
        .group_by(Plot.girl_id)
        .all()
    )

    averages = {
        result.girl_id: {
            "avg_hot": round(result.avg_hot, 2),
            "avg_crazy": round(result.avg_crazy, 2),
        }
        for result in results
    }
    return jsonify(averages)
