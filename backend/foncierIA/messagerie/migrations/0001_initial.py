from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('parcelles', '0002_verification_documents'),
        ('utilisateurs', '0002_utilisateur_adresse_ethereum'),
    ]

    operations = [
        migrations.CreateModel(
            name='Conversation',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now_add=True)),
                ('acheteur', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='conversations_acheteur', to='utilisateurs.utilisateur')),
                ('parcelle', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='conversations', to='parcelles.parcelle')),
                ('vendeur', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='conversations_vendeur', to='utilisateurs.utilisateur')),
            ],
        ),
        migrations.CreateModel(
            name='Message',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('contenu', models.TextField(blank=True)),
                ('prix_propose', models.DecimalField(blank=True, decimal_places=2, max_digits=15, null=True)),
                ('lu', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('auteur', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='utilisateurs.utilisateur')),
                ('conversation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='messagerie.conversation')),
            ],
        ),
        migrations.AddConstraint(
            model_name='conversation',
            constraint=models.UniqueConstraint(fields=('parcelle', 'acheteur'), name='conversation_unique_parcelle_acheteur'),
        ),
    ]
