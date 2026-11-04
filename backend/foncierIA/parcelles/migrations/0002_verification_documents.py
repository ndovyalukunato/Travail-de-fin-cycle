from django.db import migrations, models
import django.db.models.deletion
import parcelles.models


def marquer_existantes_verifiees(apps, schema_editor):
    """Les parcelles enregistrées avant cette fonctionnalité restent proposées aux acheteurs."""
    Parcelle = apps.get_model('parcelles', 'Parcelle')
    Parcelle.objects.update(verification='verifiee')


class Migration(migrations.Migration):

    dependencies = [
        ('parcelles', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='parcelle',
            name='verification',
            field=models.CharField(choices=[('en_attente', 'En attente de vérification'), ('verifiee', 'Vérifiée'), ('rejetee', 'Rejetée')], default='en_attente', max_length=20),
        ),
        migrations.AddField(
            model_name='parcelle',
            name='motif_rejet',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.RunPython(marquer_existantes_verifiees, migrations.RunPython.noop),
        migrations.CreateModel(
            name='DocumentParcelle',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fichier', models.FileField(max_length=255, upload_to=parcelles.models.chemin_document)),
                ('type', models.CharField(choices=[('photo', 'Photo'), ('video', 'Vidéo'), ('document', 'Document')], max_length=10)),
                ('nom', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('parcelle', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='documents', to='parcelles.parcelle')),
            ],
        ),
    ]
